/**
 * Login API
 * 
 * POST: Login with password
 */

import { NextRequest, NextResponse } from 'next/server'
import { loginUser, isSetupComplete } from '@/lib/user-auth'

export async function POST(request: NextRequest) {
  try {
    // Check if setup is complete
    const setupComplete = await isSetupComplete()
    if (!setupComplete) {
      return NextResponse.json(
        { error: 'Setup não concluído', needsSetup: true },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    const { password } = body
    if (!password) {
      return NextResponse.json(
        { error: 'Senha é obrigatória' },
        { status: 400 }
      )
    }
    
    const result = await loginUser(password)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      )
    }
    
    return NextResponse.json({
      success: true,
      company: result.company
    })
    
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Erro ao fazer login' },
      { status: 500 }
    )
  }
}
