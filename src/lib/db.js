import { openDB } from "idb";

import { DB_NAME, DB_VERSION, ensureDbSchema } from "./dbSchema";

export async function openAppDb() {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(upgradeDb) {
      ensureDbSchema(upgradeDb);
    }
  });

  return {
    async putTrack(track) {
      await db.put("tracks", track);
    },
    async getTrack(id) {
      return db.get("tracks", id);
    },
    async deleteTrack(id) {
      await db.delete("tracks", id);
    },
    async listTracksNewestFirst() {
      const tx = db.transaction("tracks");
      const index = tx.store.index("addedAt");
      const tracks = [];
      for await (const cursor of index.iterate(null, "prev")) {
        tracks.push(cursor.value);
      }
      await tx.done;
      return tracks;
    }
  };
}
