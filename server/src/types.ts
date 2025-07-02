type AuthorizeParams = {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  response_type?: string;
  nonce?: string;
  prompt?: string;
  request_uri?: string;
  request?: string;
  action: string;
};

type SignInParams = {
  redirect_uri: string;
  state: string;
  oidc_nonce?: string;
  client_id: string;
};

type TokenExchangeParams = {
  code: string;
  client_id: string;
  grant_type: string;
  client_secret?: string;
};

export type { AuthorizeParams, SignInParams, TokenExchangeParams };
