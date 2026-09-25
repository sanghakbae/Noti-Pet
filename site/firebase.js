// Firebase 웹 설정. 웹 앱 설정값은 원래 공개되는 값이고, 데이터 권한은 Firestore 보안 규칙이 막아요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

export const SDK = "https://www.gstatic.com/firebasejs/12.3.0";

export const app = initializeApp({
  apiKey: "AIzaSyBc6yQ2SlIgM3ocjJnnO_afCZoto1-BBX4",
  authDomain: "notipet-d479d.firebaseapp.com",
  projectId: "notipet-d479d",
  storageBucket: "notipet-d479d.firebasestorage.app",
  messagingSenderId: "193773140894",
  appId: "1:193773140894:web:add07d467d15f8fa99748f",
  measurementId: "G-4KXMH8FGFK",
});

/** 개발 서버(localhost)에서는 통계를 남기지 않는다. */
export const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
