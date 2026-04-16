import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Get a single contact
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const contact = await db.contact.findFirst({
      where: { id, userId: user.id },
    });

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Get contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a contact
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, cvrNumber, email, phone, address, city, postalCode, country, type, notes, isActive } = body;

    const existing = await db.contact.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (cvrNumber !== undefined) updateData.cvrNumber = cvrNumber || null;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (address !== undefined) updateData.address = address || null;
    if (city !== undefined) updateData.city = city || null;
    if (postalCode !== undefined) updateData.postalCode = postalCode || null;
    if (country !== undefined) updateData.country = country;
    if (type !== undefined) updateData.type = type;
    if (notes !== undefined) updateData.notes = notes || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const contact = await db.contact.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(
      user.id,
      'Contact',
      id,
      { name: existing.name, cvrNumber: existing.cvrNumber, email: existing.email, phone: existing.phone, type: existing.type, isActive: existing.isActive },
      updateData as Record<string, unknown>,
      requestMetadata(request)
    );

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete (set isActive=false)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await db.contact.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const contact = await db.contact.update({
      where: { id },
      data: { isActive: false },
    });

    await auditCancel(
      user.id,
      'Contact',
      id,
      'Contact deactivated via DELETE',
      requestMetadata(request)
    );

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Delete contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
