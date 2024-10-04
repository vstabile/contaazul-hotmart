import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";

const client_id = functions.config().contaazul.client_id;
const redirect_uri = functions.config().contaazul.redirect_uri;

const db = admin.firestore();
const statesCollection = db.collection("oauth_states");

// Helper function to generate random state and save to Firestore
async function generateAndSaveState() {
  const state = uuidv4(); // Generate a random state (UUID)

  // Save the state to Firestore
  await statesCollection.add({
    state: state,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return state;
}

// Function to redirect user to Conta Azul OAuth authorization URL
export const authorize = functions.https.onRequest(async (req, res) => {
  try {
    // Generate a random state
    const state = await generateAndSaveState();

    // Define the required scopes
    const scope = encodeURIComponent("sales");

    // Conta Azul OAuth2 authorization URL
    const authorizationUrl = `https://api.contaazul.com/auth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(
      redirect_uri
    )}&scope=${scope}&state=${state}`;

    // Redirect the user to Conta Azul's OAuth authorization URL
    res.redirect(authorizationUrl);
  } catch (error) {
    console.error("Error redirecting to Conta Azul:", error);
    res.status(500).send("Internal Server Error");
  }
});
