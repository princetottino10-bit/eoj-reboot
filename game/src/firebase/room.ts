import {
  doc, setDoc, updateDoc, getDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config.js';

export type RoomPhase = 'waiting' | 'draft' | 'game' | 'over';

// Firestore document shape — all game data as plain JSON
export interface RoomDoc {
  phase: RoomPhase;
  p1Joined: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftUi: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameState: Record<string, any> | null;
  createdAt: unknown;
}

function randomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)!]).join('');
}

export async function createRoom(): Promise<string> {
  const roomId = randomId();
  await setDoc(doc(db, 'rooms', roomId), {
    phase: 'waiting',
    p1Joined: false,
    draftUi: null,
    gameState: null,
    createdAt: serverTimestamp(),
  } satisfies Omit<RoomDoc, 'createdAt'> & { createdAt: unknown });
  return roomId;
}

export async function joinRoom(roomId: string): Promise<'ok' | 'full' | 'not_found'> {
  const ref  = doc(db, 'rooms', roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 'not_found';
  const data = snap.data() as RoomDoc;
  if (data.p1Joined) return 'full';
  await updateDoc(ref, { p1Joined: true, phase: 'draft' });
  return 'ok';
}

export function subscribeRoom(
  roomId: string,
  cb: (data: RoomDoc) => void,
): () => void {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (snap.exists()) cb(snap.data() as RoomDoc);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeRoomState(roomId: string, data: Record<string, any>): Promise<void> {
  // Truncate log to avoid large Firestore documents
  if (data['gameState']?.log) {
    data = { ...data, gameState: { ...data['gameState'], log: data['gameState'].log.slice(-30) } };
  }
  await updateDoc(doc(db, 'rooms', roomId), data);
}
