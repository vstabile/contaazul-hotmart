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
firebase functions:config:set contaazul.client_id="YOUR_CLIENT_ID" contaazul.client_secret="YOUR_CLIENT_SECRET"
contaazul.redirect_uri="YOUR_REDIRECT_URI" contaazul.brl_account_id="CONTA_FINANCEIRA_BRL_ID" contaazul.usd_account_id="CONTA_FINANCEIRA_USD_ID"
```

Deploy

```
cd ..
firebase deploy --only functions
```

Make your functions public by adding permission to allUsers on Google Cloud and visit the url of your `authorize` function. Then add the url of your `hotmartWebhook` function to Hotmart for the "Compra completa" event.
