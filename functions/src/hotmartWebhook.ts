import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { validateCPF, validateCNPJ, generateCPF } from "./utils";

const db = admin.firestore();
const tokensCollection = db.collection("oauth_tokens");

const PAYMENT_METHODS = {
  BILLET: "OTHER", // Conta Azul doesn't support BANKING_BILLET for Hotmart financial account
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

// Hotmart configs
// const hotmart_client_id = functions.config().hotmart.client_id;
// const hotmart_client_secret = functions.config().hotmart.client_secret;
// const hotmart_basic_token = functions.config().hotmart.basic_token;

// Conta Azul configs
const conta_azul_client_id = functions.config().contaazul.client_id;
const conta_azul_client_secret = functions.config().contaazul.client_secret;
const brl_account_id = functions.config().contaazul.brl_account_id;
const usd_account_id = functions.config().contaazul.usd_account_id;
// const affiliate_service_id = functions.config().contaazul.affiliate_service_id;
// const payment_service_id = functions.config().contaazul.payment_service_id;
// const streaming_service_id = functions.config().contaazul.streaming_service_id;
// const installment_service_id =
//   functions.config().contaazul.installment_service_id;

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
    // const { product, buyer, purchase, commissions } = webhookData.data;
    const { product, buyer, purchase } = webhookData.data;

    // Exchange rate applied to customers currency
    let purchase_exchange_rate = 1;
    if (purchase.price.currency_value !== "BRL") {
      purchase_exchange_rate =
        purchase.original_offer_price.value / purchase.price.value;
    }

    // Exchange rate applied to costs (USDBRL when foreign currency)
    // let costs_exchange_rate = 1;
    // if (purchase.price.currency_value !== "BRL") {
    //   costs_exchange_rate = commissions.find(
    //     (item: any) => item.source === "PRODUCER"
    //   )?.currency_conversion?.conversion_rate;
    // }

    // Get sales commission breakdown from Hotmart
    // const otherCommissions = await getSalesCommissions(purchase.transaction);

    // const costs = [
    //   {
    //     service_id: payment_service_id,
    //     quantity: 1,
    //     value:
    //       commissions.find((item: any) => item.source === "MARKETPLACE").value *
    //       costs_exchange_rate,
    //   },
    //   ...otherCommissions.items[0].commissions
    //     .map((item: any) => {
    //       if (item.source === "AFFILIATE") {
    //         return {
    //           service_id: affiliate_service_id,
    //           quantity: 1,
    //           value: item.commission.value * costs_exchange_rate,
    //           description: `Afiliado: ${item.user.name}`,
    //         };
    //       } else if (item.source === "ADDON") {
    //         return {
    //           service_id: streaming_service_id,
    //           quantity: 1,
    //           value: item.commission.value * costs_exchange_rate,
    //           description: "Taxa de streaming",
    //         };
    //       } else {
    //         return null;
    //       }
    //     })
    //     .filter((item: any) => item !== null),
    // ];

    const accessToken = await getContaAzulAccessToken();

    const services = [
      {
        service_id: await getServiceIdFromProduct(
          product,
          purchase,
          accessToken
        ),
        quantity: 1,
        value: purchase.price.value * purchase_exchange_rate,
        description: `Hotmart Transaction: ${purchase.transaction}`,
      },
      // ...costs,
    ];

    // Calculate installment costs
    // const other_costs = costs.reduce((acc: number, item: any) => {
    //   return acc + item.value;
    // });

    // if (services[0].value - other_costs > 0) {
    //   services.push({
    //     service_id: installment_service_id,
    //     quantity: 1,
    //     value: services[0].value - other_costs,
    //   });
    // }

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
      services: [services[0]], // TODO: Figure out how to account for transaction costs
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
            value: purchase.price.value * purchase_exchange_rate, // TODO: Figure out how to subtract all transaction costs
            due_date: new Date(Number(due_date)).toISOString(),
            status: "PENDING",
            hasBillet: false,
          },
        ],
        financial_account_id:
          purchase.price.currency_value === "BRL"
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

// Get sales commissions information from Hotmart
// async function getSalesCommissions(transaction: string): Promise<any> {
//   const token = await getHotmartAccessToken();

//   const headers = {
//     Authorization: `Bearer ${token}`,
//     "Content-Type": "application/json",
//   };

//   const response = (await axios.get(
//     `https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${transaction}`,
//     { headers }
//   )) as any;

//   return response.data;
// }

// Create a new service sale in Conta Azul
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

// Get Hotmart OAuth2 access token
// async function getHotmartAccessToken(): Promise<string> {
//   try {
//     const tokenDoc = await tokensCollection.doc("hotmart").get();

//     if (!tokenDoc.exists) {
//       throw new Error("OAuth tokens not found");
//     }

//     const { access_token, expires_at } = tokenDoc.data() as {
//       access_token: string;
//       expires_at: number;
//     };

//     // Check if the access token is expired
//     const currentTime = Date.now();

//     if (currentTime > expires_at) {
//       const { access_token, expires_in } =
//         (await refreshHotmartAccessToken()) as {
//           access_token: string;
//           expires_in: number;
//         };

//       await tokensCollection.doc("hotmart").update({
//         access_token: access_token,
//         expires_at: currentTime + expires_in * 1000,
//       });

//       return access_token;
//     }

//     return access_token;
//   } catch (error) {
//     console.error("Error getting or refreshing access token:", error);
//     throw new Error("Failed to retrieve or refresh access token");
//   }
// }

// Get Hotmart OAuth2 access token
// const refreshHotmartAccessToken = async () => {
//   try {
//     const headers = {
//       Authorization: `Basic ${hotmart_basic_token}`,
//       "Content-Type": "application/json",
//     };

//     const response = await axios.post(
//       "https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials",
//       {
//         client_id: hotmart_client_id,
//         client_secret: hotmart_client_secret,
//       },
//       { headers }
//     );

//     return response.data;
//   } catch (error) {
//     console.error("Error refreshing Hotmart access token:", error);
//     throw new Error("Unable to refresh Hotmart access token");
//   }
// };

// Get Conta Azul OAuth2 access token
async function getContaAzulAccessToken(): Promise<string> {
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
      const refreshedTokens = (await refreshContaAzulAccessToken(
        refresh_token
      )) as {
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

// Refresh Conta Azul OAuth2 access token
const refreshContaAzulAccessToken = async (refresh_token: string) => {
  try {
    const response = await axios.post(
      "https://api.contaazul.com/oauth2/token",
      {
        grant_type: "refresh_token",
        refresh_token: refresh_token,
        client_id: conta_azul_client_id,
        client_secret: conta_azul_client_secret,
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
  let document = buyer.document;
  if (
    typeof document !== "string" ||
    (!validateCPF(document) && !validateCNPJ(document))
  ) {
    document = generateCPF();
  }

  // Conta Azul does not support phone numbers with more than 11 digits
  let phone = buyer.checkout_phone;
  phone = phone.slice(-11);

  // Conta Azul API does not support foreign addresses
  let address = buyer.address;
  if (address?.country_iso !== "BR") {
    address = {};
  }

  // Conta Azul does not accept invalid zipcodes
  const zipcode = address?.zipcode?.replace(/\D+/g, "");
  if (zipcode && zipcode.length !== 8) {
    address.zipcode = default_zipcode;
  }

  const person_type = document.length > 11 ? "LEGAL" : "NATURAL";

  let newCustomerData: any = {
    name: buyer.name,
    email: buyer.email,
    document,
    person_type,
    business_phone: phone,
    address: {
      zip_code: address?.zipcode || default_zipcode,
      street: address?.address || default_street,
      number: address?.number.slice(-10) || default_number,
      complement: address?.complement || "",
      neighborhood: address?.neighborhood || default_neighborhood,
      city: address?.city || default_city,
      state: address?.state || default_state,
    },
  };

  if (person_type === "LEGAL") {
    newCustomerData = {
      ...newCustomerData,
      company_name: buyer.name,
    };
  }

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
