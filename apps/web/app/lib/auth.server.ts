import { redirect } from "@remix-run/node";

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthResponse {
  authenticated: boolean;
  user?: User;
}

/**
 * Check if user is authenticated by calling the backend /v1/auth/me endpoint
 * Forwards cookies from the request to maintain session
 */
export async function getAuthenticatedUser(request: Request): Promise<User | null> {
  try {
    const cookieHeader = request.headers.get('Cookie');
    
    const response = await fetch(`${API_BASE_URL}/v1/auth/me`, {
      headers: {
        Cookie: cookieHeader || '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data: AuthResponse = await response.json();
    
    if (!data.authenticated || !data.user) {
      return null;
    }

    return data.user;
  } catch (error) {
    console.error('Failed to get authenticated user:', error);
    return null;
  }
}

/**
 * Require user to be authenticated
 * If not authenticated, redirect to /auth/login
 */
export async function requireUser(request: Request): Promise<User> {
  const user = await getAuthenticatedUser(request);
  
  if (!user) {
    throw redirect('/auth/login');
  }
  
  return user;
}

/**
 * Logout user by calling the backend /v1/auth/logout endpoint
 */
export async function logout(request: Request): Promise<Response> {
  const cookieHeader = request.headers.get('Cookie');
  
  const response = await fetch(`${API_BASE_URL}/v1/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader || '',
    },
    credentials: 'include',
  });

  return response;
}
