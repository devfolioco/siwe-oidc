import { Request, Response } from 'express';
import { oidcService } from '../services/oidc.js';
import { AuthorizeParams, SignInParams } from '../types.js';

export const authorize = async (req: Request, res: Response) => {
  try {
    const { sessionId, redirectUrl } = await oidcService.authorize(
      req.query as unknown as AuthorizeParams
    );

    res.cookie('session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 300000, // 5 minutes
      path: '/',
    });

    res.redirect(redirectUrl as string);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
};

export const signIn = async (req: Request, res: Response) => {
  try {
    const { redirectUrl } = await oidcService.signIn({
      params: req.query as unknown as SignInParams,
      cookies: req.cookies,
    });

    res.redirect(redirectUrl as string);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
};

export const userinfo = async (req: Request, res: Response) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).send({ error: 'Unauthorized: Missing access token' });
    }

    const userInfo = await oidcService.userinfo(accessToken);

    // Set content type to application/json
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(userInfo);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
};

export const tokenExchange = async (req: Request, res: Response) => {
  try {
    const token = await oidcService.tokenExchange({
      code: req.body.code,
      client_id: req.body.client_id,
      client_secret: req.body.client_secret,
      grant_type: req.body.grant_type,
    });

    return res.status(200).send(token);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
};
