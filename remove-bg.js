// Vercel serverless function: /api/remove-bg
//
// Holds the remove.bg API key privately on the server. The page never
// sees this key — it just POSTs the uploaded image here, and this
// function forwards it to remove.bg and streams the result back.
//
// Setup on Vercel:
//   1. Deploy this project (this file just needs to live in /api).
//   2. In your Vercel project settings → Environment Variables, add:
//        REMOVE_BG_API_KEY = <your real remove.bg key>
//   3. Redeploy so the function picks up the new variable.

export default async function handler(req, res) {
  // Visit /api/remove-bg?ping=1 in your browser after deploying to check,
  // without exposing the key itself, whether Vercel can see it.
  if (req.method === "GET" && req.query && req.query.ping) {
    res.status(200).json({ keyConfigured: Boolean(process.env.REMOVE_BG_API_KEY) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    console.error("REMOVE_BG_API_KEY is not set on this deployment.");
    res.status(500).json({ error: "Server is missing REMOVE_BG_API_KEY. Add it in Vercel project settings, then redeploy." });
    return;
  }

  try {
    // Read the raw multipart body sent by the browser and pass it
    // straight through to remove.bg with the same Content-Type
    // (including its boundary), just swapping in the real API key.
    // req.body may already be a Buffer if bodyParser wasn't disabled
    // for some reason — handle both cases defensively.
    let body;
    if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    if (!body || body.length === 0) {
      console.error("remove-bg: received an empty request body.");
      res.status(400).json({ error: "No image data was received by the server." });
      return;
    }

    const upstream = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": req.headers["content-type"] || "multipart/form-data"
      },
      body
    });

    if (!upstream.ok) {
      let message = upstream.statusText;
      try {
        const errJson = await upstream.json();
        if (errJson.errors && errJson.errors[0]) message = errJson.errors[0].title;
      } catch (e) { /* not JSON, keep statusText */ }
      console.error("remove.bg rejected the request:", upstream.status, message);
      res.status(upstream.status).json({ error: message });
      return;
    }

    const resultBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.status(200).send(resultBuffer);

  } catch (err) {
    console.error("remove-bg proxy crashed:", err);
    res.status(500).json({ error: err.message || "Background removal failed." });
  }
}

// Allow request bodies up to the Vercel plan's limit (Hobby ≈ 4.5MB).
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  }
};
