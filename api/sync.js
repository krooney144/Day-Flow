import { put, list, del } from "@vercel/blob";

export default async function handler(req, res) {
  const userKey = req.headers["x-user-key"];
  if (!userKey) {
    return res.status(401).json({ error: "Missing user key" });
  }

  const blobPath = `dayflow-${userKey}.json`;

  try {
    if (req.method === "GET") {
      const { blobs } = await list({ prefix: blobPath, limit: 1 });
      if (blobs.length === 0) {
        return res.status(404).json(null);
      }
      const response = await fetch(blobs[0].url);
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      await put(blobPath, JSON.stringify(req.body), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { blobs } = await list({ prefix: blobPath, limit: 1 });
      if (blobs.length > 0) {
        await del(blobs[0].url);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: "Sync failed" });
  }
}
