# Hotmart integration with Conta Azul

Install `firebase-tools`

```
npm install -g firebase-tools
```

Clone this repository

```
git clone git@github.com:vstabile/contaazul-hotmart.git
```

Install dependencies

```
cd contaazul-hotmart/functions
npm install
```

Configure seu projeto

```
firebase functions:config:set contaazul.client_id="CONTA_AZUL_CLIENT_ID" \
contaazul.client_secret="CONTA_AZUL_CLIENT_SECRET" \
contaazul.redirect_uri="YOUR_REDIRECT_URI" \
contaazul.brl_account_id="CONTA_FINANCEIRA_BRL_ID" \
contaazul.usd_account_id="CONTA_FINANCEIRA_USD_ID" \
contaazul.affiliate_service_id="AFFILIATE_SERVICE_ID" \
contaazul.payment_service_id="PAYMENT_PROCESSING_SERVICE_ID" \
contaazul.streaming_service_id="STREAMING_SERVICE_ID" \
contaazul.installment_service_id="INSTALLMENT_FEE_SERVICE_ID" \
hotmart.client_id="HOTMART_CLIENT_ID" \
hotmart.client_secret="HOTMART_CLIENT_SECRET" \
hotmart.basic_token="BASIC_TOKEN" \
default_address.zipcode="12123-100" \
default_address.street="Rua Padrão" \
default_address.number="1" \
default_address.neighborhood="Bairro Padrão" \
default_address.city="São Paulo" \
default_address.state="SP"
```

Deploy

```
cd ..
firebase deploy --only functions
```

Make your functions public by adding permission to allUsers on Google Cloud and visit the url of your `authorize` function. Then add the url of your `hotmartWebhook` function to Hotmart for the "Compra completa" event.
