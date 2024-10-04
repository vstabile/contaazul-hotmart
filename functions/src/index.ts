// Import the functions from separate files
import * as admin from "firebase-admin";

admin.initializeApp();

import { hotmartWebhook } from "./hotmartWebhook";
import { oauthRedirect } from "./oauthRedirect";
import { authorize } from "./authorize";

export { hotmartWebhook, oauthRedirect, authorize };
