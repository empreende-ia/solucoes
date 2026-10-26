import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase'
import { normalizePhoneNumber, validateAnyPhoneNumber } from '@/lib/phone-formatter'

/**
 * API Route: Test Contact Settings
 * 
 * Persists the test contact (name + phone) in Supabase settings table
 * This replaces the localStorage approach for better persistence
 */

const SETTING_KEY = 'test_contact'

export async function GET() {
    try {
        if (!isSupabaseConfigured()) {
            return NextResponse.json(null)
        }

        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', SETTING_KEY)
            .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw error
        }

        if (data?.value) {
            // Parse JSON string to object (column is TEXT type)
            if (typeof data.value === 'string') {
                try {
                    const parsed = JSON.parse(data.value)
                    return NextResponse.json(parsed)
                } catch {
                    // Compat: versões antigas podem ter salvo apenas o telefone em texto.
                    const asText = String(data.value || '').trim()
                    const normalized = normalizePhoneNumber(asText)
                    const validation = validateAnyPhoneNumber(normalized)
                    if (validation.isValid) {
                        return NextResponse.json({ phone: normalized })
                    }
                    return NextResponse.json(null)
                }
            }

            return NextResponse.json(data.value)
        }

        return NextResponse.json(null)
    } catch (error) {
        console.error('Error fetching test contact:', error)
        return NextResponse.json(
            // Evita 500 para não causar cascata de retries/lentidão no frontend.
            { error: 'Failed to fetch test contact', details: String((error as any)?.message || error) }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, phone } = body

        if (!phone) {
            return NextResponse.json(
                { error: 'Phone number is required' },
                { status: 400 }
            )
        }

        // Normalize first so we accept inputs like "5511999999999" (without '+')
        const normalizedPhoneE164 = normalizePhoneNumber(String(phone))

        const phoneValidation = validateAnyPhoneNumber(normalizedPhoneE164)
        if (!phoneValidation.isValid) {
            return NextResponse.json(
                { error: phoneValidation.error || 'Telefone inválido' },
                { status: 400 }
            )
        }

        const testContact = {
            name: name?.trim() || '',
            phone: normalizedPhoneE164,
            updatedAt: new Date().toISOString()
        }

        // Upsert into settings table (stringify for TEXT column)
        const { error } = await supabase
            .from('settings')
            .upsert({
                key: SETTING_KEY,
                value: JSON.stringify(testContact)
            }, {
                onConflict: 'key'
            })

        if (error) throw error

        return NextResponse.json({
            success: true,
            testContact
        })
    } catch (error) {
        console.error('Error saving test contact:', error)
        return NextResponse.json(
            { error: 'Failed to save test contact' },
            { status: 500 }
        )
    }
}

export async function DELETE() {
    try {
        const { error } = await supabase
            .from('settings')
            .delete()
            .eq('key', SETTING_KEY)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting test contact:', error)
        return NextResponse.json(
            { error: 'Failed to delete test contact' },
            { status: 500 }
        )
    }
}
