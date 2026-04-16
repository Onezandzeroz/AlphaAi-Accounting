import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { ContactType } from '@prisma/client';

// GET - List contacts for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = { userId: user.id };

    if (typeFilter && Object.values(ContactType).includes(typeFilter as ContactType)) {
      where.type = typeFilter;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { cvrNumber: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const contacts = await db.contact.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('List contacts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, cvrNumber, email, phone, address, city, postalCode, country, type, notes } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Validate contact type if provided
    if (type && !Object.values(ContactType).includes(type)) {
      return NextResponse.json(
        { error: `Invalid contact type. Must be one of: ${Object.values(ContactType).join(', ')}` },
        { status: 400 }
      );
    }

    const contact = await db.contact.create({
      data: {
        name,
        cvrNumber: cvrNumber || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        postalCode: postalCode || null,
        country: country || 'Danmark',
        type: type || 'CUSTOMER',
        notes: notes || null,
        userId: user.id,
      },
    });

    await auditCreate(
      user.id,
      'Contact',
      contact.id,
      { name, cvrNumber, email, phone, type },
      requestMetadata(request)
    );

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
