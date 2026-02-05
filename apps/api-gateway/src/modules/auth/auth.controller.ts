import { Controller, Get, Post, Req, Res, UseGuards, Query, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Logger } from '@betting-exchange/shared-config';
import axios from 'axios';

@Controller('v1/auth')
export class AuthController {
  private logger = new Logger('AuthController');

  constructor(private authService: AuthService) {}

  /**
   * GET /v1/auth/google
   * Initiates Google OAuth flow
   */
  @Get('google')
  async googleAuth(@Res() res: FastifyReply) {
    // Manually construct Google OAuth URL
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;
    const scope = 'email profile';
    
    const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + 
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}`;
    
    this.logger.info(`Redirecting to Google OAuth: ${googleAuthUrl}`);
    res.redirect(302, googleAuthUrl);
  }

  /**
   * GET /v1/auth/google/callback
   * Google OAuth callback - manually handle code exchange
   */
  @Get('google/callback')
  async googleAuthCallback(
    @Query('code') code: string,
    @Req() req: FastifyRequest & { session: any },
    @Res() res: FastifyReply,
  ) {
    try {
      if (!code) {
        this.logger.error('No code provided in OAuth callback');
        const failureUrl = process.env.AUTH_FAILURE_REDIRECT || 'http://localhost:5173/auth/login';
        return res.redirect(failureUrl);
      }

      // Exchange code for tokens
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      });

      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const googleUser = userInfoResponse.data;
      
      // Create user profile in the format AuthService expects
      const userProfile = {
        googleSub: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      };

      // Handle user login (create or find user)
      const user = await this.authService.handleGoogleLogin(userProfile);

      // Store user ID in session
      req.session.userId = user.id;
      
      // Save session and wait for it to complete
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.logger.info(`User authenticated: ${user.email}, redirecting to app`);

      // Redirect to success URL - use 302 status code explicitly
      const redirectUrl = process.env.AUTH_SUCCESS_REDIRECT || 'http://localhost:5173/app';
      this.logger.info(`Redirecting to: ${redirectUrl}`);
      res.status(302).header('Location', redirectUrl).send();
    } catch (error) {
      this.logger.error('Google auth callback error:', error);
      const failureUrl = process.env.AUTH_FAILURE_REDIRECT || 'http://localhost:5173/auth/login';
      res.status(302).header('Location', failureUrl).send();
    }
  }

  /**
   * POST /v1/auth/logout
   * Destroys session
   */
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest & { session: any },
    @Res() res: FastifyReply,
  ) {
    return new Promise((resolve) => {
      req.session.destroy((err: any) => {
        if (err) {
          this.logger.error('Logout error:', err);
          return res.status(500).send({ success: false, error: 'Failed to logout' });
        }
        res.send({ success: true });
        resolve(null);
      });
    });
  }

  /**
   * POST /v1/auth/signup
   * Register with email and password
   */
  @Post('signup')
  async signup(
    @Body() body: { email: string; password: string; name?: string },
    @Req() req: FastifyRequest & { session: any },
    @Res() res: FastifyReply,
  ) {
    try {
      const { email, password, name } = body;

      // Validate input
      if (!email || !password) {
        throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
      }

      if (password.length < 6) {
        throw new HttpException('Password must be at least 6 characters', HttpStatus.BAD_REQUEST);
      }

      // Register user
      const user = await this.authService.registerWithPassword({ email, password, name });

      // Store user ID in session
      req.session.userId = user.id;

      // Save session and wait for it to complete
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.logger.info(`User registered and logged in: ${user.email}`);

      return res.send({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error) {
      this.logger.error('Signup error:', error);
      if (error.message === 'User with this email already exists') {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }
      throw new HttpException('Registration failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /v1/auth/login
   * Login with email and password
   */
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: FastifyRequest & { session: any },
    @Res() res: FastifyReply,
  ) {
    try {
      const { email, password } = body;

      // Validate input
      if (!email || !password) {
        throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
      }

      // Login user
      const user = await this.authService.loginWithPassword(email, password);

      // Store user ID in session
      req.session.userId = user.id;
      
      this.logger.info(`[LOGIN] Setting userId in session:`, {
        userId: user.id,
        sessionId: req.session.sessionId,
        sessionBefore: { ...req.session }
      });

      // Save session and wait for it to complete
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            this.logger.error(`[LOGIN] Session save failed:`, err);
            reject(err);
          } else {
            this.logger.info(`[LOGIN] Session saved successfully:`, {
              sessionId: req.session.sessionId,
              sessionAfter: { ...req.session },
              cookies: res.getHeader('set-cookie')
            });
            resolve();
          }
        });
      });

      this.logger.info(`User logged in: ${user.email}`);

      return res.send({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error) {
      this.logger.error('Login error:', error);
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * GET /v1/auth/me
   * Returns current user if authenticated
   */
  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session.userId;
    const user = await this.authService.getUserById(userId);
    
    if (!user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
