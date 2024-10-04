import * as functions from "firebase-functions";
import axios from "axios";
import * as admin from "firebase-admin";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const client_id = functions.config().contaazul.client_id;
const client_secret = functions.config().contaazul.client_secret;
const redirect_uri = functions.config().contaazul.redirect_uri;

const db = admin.firestore();
const statesCollection = db.collection("oauth_states");
const tokensCollection = db.collection("oauth_tokens");

export const oauthRedirect = functions.https.onRequest(async (req, res) => {
  const { code, state } = req.query;

  // Check if state is the most recent state
  const latestState = await statesCollection
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (state !== latestState.docs[0].data().state) {
    res.status(401).send("Invalid state");
    return;
  }

  if (!code) {
    res.status(400).send("Missing authorization code");
    return;
  }

  console.log("code", code);

  try {
    // Step 1: Exchange authorization code for access token
    const tokenResponse = await axios.post<TokenResponse>(
      "https://api.contaazul.com/oauth2/token",
      {
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id,
        client_secret,
      }
    );

    // Step 2: Save the tokens and expiration time in Firestore
    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    console.log("access_token", access_token);
    console.log("refresh_token", refresh_token);
    console.log("expires_in", expires_in);

    await tokensCollection.doc("contaAzul").set({
      access_token,
      refresh_token,
      expires_in,
      expires_at: Date.now() + expires_in * 1000, // Store expiration timestamp
    });

    res.status(200).send("Tokens received and stored successfully!");
  } catch (error) {
    console.error("Error exchanging authorization code:", error);
    res.status(500).send("Error during OAuth token exchange");
  }
});
