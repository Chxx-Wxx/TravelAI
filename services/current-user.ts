import * as Crypto from "expo-crypto";

import {
  getStoredUserId,
  saveUserId,
} from "../lib/storage";

import type {
  AppUser,
} from "../types";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

let currentUserPromise:
  Promise<AppUser> | null = null;

// 로그인 전 단계의 로컬 identity이며 인증/권한 증명이 아니다.

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  return API_URL;
}

async function getOrCreateUserId() {
  const storedUserId =
    await getStoredUserId();

  if (storedUserId) {
    return storedUserId;
  }

  const userId = Crypto.randomUUID();
  await saveUserId(userId);

  return userId;
}

async function ensureServerUser(
  userId: string
): Promise<AppUser> {
  const apiUrl = requireApiUrl();
  const response = await fetch(
    `${apiUrl}/users/ensure`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({ userId }),
    }
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "사용자 정보를 확인하지 못했습니다."
    );
  }

  return data.user;
}

export function getCurrentUser() {
  if (!currentUserPromise) {
    currentUserPromise =
      getOrCreateUserId()
        .then(ensureServerUser)
        .catch((error) => {
          currentUserPromise = null;
          throw error;
        });
  }

  return currentUserPromise;
}
