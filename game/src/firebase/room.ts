import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config.js";

export type RoomPhase = "waiting" | "draft" | "game" | "over";

// Firestore document shape — all game data as plain JSON
export interface RoomDoc {
  phase: RoomPhase;
  createdBy: string;
  joinedBy: string | null;
  draftUi: Record<string, unknown> | null;
  gameState: Record<string, unknown> | null;
  createdAt: unknown;
}

function randomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    // biome-ignore lint/style/noNonNullAssertion: bounded index into const chars string
    () => chars[Math.floor(Math.random() * chars.length)!],
  ).join("");
}

export async function createRoom(uid: string): Promise<string> {
  const roomId = randomId();
  await setDoc(doc(db, "rooms", roomId), {
    phase: "waiting" as RoomPhase,
    createdBy: uid,
    joinedBy: null,
    draftUi: null,
    gameState: null,
    createdAt: serverTimestamp(),
  } satisfies Omit<RoomDoc, "createdAt"> & { createdAt: unknown });
  return roomId;
}

export async function joinRoom(
  roomId: string,
  uid: string,
): Promise<"ok" | "full" | "not_found"> {
  const ref = doc(db, "rooms", roomId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("not_found");
      const data = snap.data() as RoomDoc;
      if (data.joinedBy !== null) throw new Error("full");
      tx.update(ref, { joinedBy: uid, phase: "draft" });
    });
    return "ok";
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "not_found" || e.message === "full")
    ) {
      return e.message as "not_found" | "full";
    }
    throw e;
  }
}

export function subscribeRoom(
  roomId: string,
  cb: (data: RoomDoc) => void,
): () => void {
  return onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (snap.exists()) cb(snap.data() as RoomDoc);
  });
}

export async function writeRoomState(
  roomId: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Truncate log to avoid large Firestore documents
  const gs = data.gameState as Record<string, unknown> | null | undefined;
  if (gs?.log) {
    data = {
      ...data,
      gameState: { ...gs, log: (gs.log as unknown[]).slice(-30) },
    };
  }
  // biome-ignore lint/suspicious/noExplicitAny: Firestore updateDoc requires Record<string, any>
  await updateDoc(doc(db, "rooms", roomId), data as Record<string, any>);
}
