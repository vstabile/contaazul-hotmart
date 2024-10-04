import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { validateCPF, validateCNPJ, generateCPF } from "./utils";

const db = admin.firestore();
const tokensCollection = db.collection("oauth_tokens");

const PAYMENT_METHODS = {
  BILLET: "BANKING_BILLET",
  PIX: "INSTANT_PAYMENT",
  DIRECT_DEBIT: "DEBIT_CARD",
  CREDIT_CARD: "CREDIT_CARD",
  PAYPAL: "CREDIT_CARD",
  PAYPAL_INTERNACIONAL: "CREDIT_CARD",
  GOOGLE_PAY: "CREDIT_CARD",
  HOTCARD: "CREDIT_CARD",
  PICPAY: "CREDIT_CARD",
  SAMSUNG_PAY: "CREDIT_CARD",
  FINANCED_BILLET: "OTHER",
  FINANCED_INSTALLMENT: "OTHER",
  HYBRID: "OTHER",
  WALLET: "DIGITAL_WALLET",
  DIRECT_BANK_TRANSFER: "BANKING_TRANSFER",
  MANUAL_TRANSFER: "BANKING_TRANSFER",
  CASH_PAYMENT: "CASH",
};

const client_id = functions.config().contaazul.client_id;
const client_secret = functions.config().contaazul.client_secret;
const brl_account_id = functions.config().contaazul.brl_account_id;
const usd_account_id = functions.config().contaazul.usd_account_id;

const default_zipcode = functions.config().default_address.zipcode;
const default_street = functions.config().default_address.street;
const default_number = functions.config().default_address.number;
const default_neighborhood = functions.config().default_address.neighborhood;
const default_city = functions.config().default_address.city;
const default_state = functions.config().default_address.state;

// Webhook endpoint to receive Hotmart webhooks
export const hotmartWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const webhookData = req.body;

    // Ignore events other than `PURCHASE_COMPLETE`
    if (webhookData.event !== "PURCHASE_COMPLETE") {
      res.status(200).send("Event ignored");
    }

    // Extract necessary information from Hotmart webhook
    const { product, buyer, purchase } = webhookData.data;
    // const { product, buyer, affiliates, commissions, purchase } =
    //   webhookData.data;

    const accessToken = await getAccessToken();

    const due_date = [
      "PIX",
      "BILLET",
      "DIRECT_DEBIT",
      "DIRECT_BANK_TRANSFER",
    ].includes(purchase.payment.type)
      ? purchase.order_date + 259200000
      : purchase.order_date + 2592000000;

    // Create data to send to Conta Azul API
    const saleData = {
      emission: new Date(Number(purchase.order_date)).toISOString(),
      status: "COMMITTED",
      customer_id: await getCustomerIdFromBuyer(buyer, accessToken),
      services: [
        {
          quantity: 1,
          service_id: await getServiceIdFromProduct(
            product,
            purchase,
            accessToken
          ),
          value: purchase.full_price.value,
        },
      ],
      notes: `Identificador transação Hotmart: ${purchase.transaction}`,
      payment: {
        type: "CASH",
        method:
          PAYMENT_METHODS[
            purchase.payment.type as keyof typeof PAYMENT_METHODS
          ] ?? "OTHER",
        installments: [
          {
            number: 1,
            value: purchase.full_price.value,
            due_date: new Date(Number(due_date)).toISOString(),
            status: "PENDING",
            hasBillet: purchase.payment.type === "BILLET",
          },
        ],
        financial_account_id:
          purchase.full_price.currency_value === "BRL"
            ? brl_account_id
            : usd_account_id,
      },
    };

    await createServiceSale(saleData, accessToken);

    // Respond to Hotmart that webhook was received successfully
    res.status(200).send("Webhook processed successfully");
  } catch (error) {
    console.error("Error processing webhook", error);
    res.status(500).send("Error processing webhook");
  }
});

// Helper function to create a new service sale in Conta Azul
async function createServiceSale(saleData: any, accessToken: string) {
  try {
    const response = await axios.post(
      "https://api.contaazul.com/v1/sales",
      saleData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error creating service sale in Conta Azul", error);
    throw error;
  }
}

// Get OAuth2 access token
async function getAccessToken(): Promise<string> {
  try {
    const tokenDoc = await tokensCollection.doc("contaAzul").get();

    if (!tokenDoc.exists) {
      throw new Error("OAuth tokens not found");
    }

    const { access_token, refresh_token, expires_at } = tokenDoc.data() as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };

    // Check if the access token is expired
    const currentTime = Date.now();

    if (currentTime > expires_at) {
      const refreshedTokens = (await refreshAccessToken(refresh_token)) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      await tokensCollection.doc("contaAzul").update({
        access_token: refreshedTokens.access_token,
        refresh_token: refreshedTokens.refresh_token,
        expires_at: currentTime + refreshedTokens.expires_in * 1000,
      });

      return refreshedTokens.access_token;
    }

    return access_token;
  } catch (error) {
    console.error("Error getting or refreshing access token:", error);
    throw new Error("Failed to retrieve or refresh access token");
  }
}

// Refresh OAuth2 access token
const refreshAccessToken = async (refresh_token: string) => {
  try {
    const response = await axios.post(
      "https://api.contaazul.com/oauth2/token",
      {
        grant_type: "refresh_token",
        refresh_token: refresh_token,
        client_id,
        client_secret,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    throw new Error("Unable to refresh access token");
  }
};

// Example: Map buyer info to Conta Azul customer or create a new one
async function getCustomerIdFromBuyer(
  buyer: any,
  token: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let customerId: string | null = null;

  if (buyer.document) {
    // First try searching by document (CPF or CNPJ)
    try {
      const searchByDocumentResponse = (await axios.get(
        `https://api.contaazul.com/v1/customers?document=${buyer.document}`,
        { headers }
      )) as any;
      if (searchByDocumentResponse.data.length > 0) {
        return searchByDocumentResponse.data[0].id; // Return the first customer found by document
      }
    } catch (error) {
      console.error("Error searching customer by document:", error);
    }
  } else {
    // When there is no document, try searching by email
    try {
      const searchByEmailResponse = (await axios.get(
        `https://api.contaazul.com/v1/customers?search=${buyer.email}`,
        { headers }
      )) as any;
      if (searchByEmailResponse.data.length > 0) {
        return searchByEmailResponse.data[0].id; // Return the first customer found by email
      }
    } catch (error) {
      console.error("Error searching customer by email:", error);
    }
  }

  // Create a new customer when none is found
  let document = buyer.document?.replace(/\D+/g, "");
  if (!validateCPF(document) && !validateCNPJ(document))
    document = generateCPF();

  const newCustomerData = {
    name: buyer.name,
    email: buyer.email,
    document,
    person_type: document.length > 11 ? "LEGAL" : "NATURAL",
    business_phone: buyer.checkout_phone,
    address: {
      zip_code: buyer.address?.zipcode || default_zipcode,
      street: buyer.address?.address || default_street,
      number: buyer.address?.number || default_number,
      complement: buyer.address?.complement || "",
      neighborhood: buyer.address?.neighborhood || default_neighborhood,
      city: buyer.address?.city || default_city,
      state: buyer.address?.state || default_state,
    },
  };

  try {
    const createCustomerResponse = (await axios.post(
      "https://api.contaazul.com/v1/customers",
      newCustomerData,
      { headers }
    )) as any;

    customerId = createCustomerResponse.data.id;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw new Error("Failed to create customer");
  }

  if (customerId === null) throw new Error("Failed to create customer");

  return customerId;
}

// Example: Map product info to Conta Azul service or create a new one
async function getServiceIdFromProduct(
  product: any,
  purchase: any,
  token: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let serviceId: string | null = null;

  // Search for the service by the product code (ucode)
  try {
    const searchByCodeResponse = (await axios.get(
      `https://api.contaazul.com/v1/services?code=${product.id}`,
      {
        headers,
      }
    )) as any;

    // If a service is found, return the first result's ID
    if (searchByCodeResponse.data.length > 0) {
      return searchByCodeResponse.data[0].id;
    }
  } catch (error) {
    console.error("Error searching service by code:", error);
    throw new Error("Failed to search for service by code");
  }

  // If no service is found, create a new one using the product information
  const newServiceData = {
    name: product.name,
    type: "PROVIDED",
    code: product.id,
    value: purchase.price.value,
    cost: 0,
  };

  try {
    const createServiceResponse = (await axios.post(
      "https://api.contaazul.com/v1/services",
      newServiceData,
      { headers }
    )) as any;

    // Retrieve the newly created service ID
    serviceId = createServiceResponse.data.id;
  } catch (error) {
    console.error("Error creating new service:", error);
    throw new Error("Failed to create new service");
  }

  if (serviceId === null) throw new Error("Failed to create new service");

  return serviceId;
}
