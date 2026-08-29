import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Honour DATABASE_URL when present (test/e2e runners point it at a disposable
// database) so a stray `tsx prisma/seed.ts` can't clobber prisma/dev.db.
const prisma = new PrismaClient(
  process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined,
);

async function main() {
  // SEED_DATA_FILE lets a caller seed from an isolated fixture instead of the
  // working copy of data.json.
  const dataPath = process.env.SEED_DATA_FILE
    ? path.resolve(process.env.SEED_DATA_FILE)
    : path.resolve(process.cwd(), 'data.json');
  console.log('Seeding SQLite database from', dataPath);

  if (!fs.existsSync(dataPath)) {
    console.error('seed data file not found at:', dataPath);
    return;
  }

  const raw = fs.readFileSync(dataPath, 'utf-8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);

  // 1. Seed Departments
  console.log(`Seeding ${data.departments?.length || 0} departments...`);
  for (const dept of data.departments || []) {
    await prisma.department.upsert({
      where: { id: dept.id },
      update: {
        name: dept.name,
        description: dept.description || '',
        directorId: dept.directorId || null,
        isActive: dept.isActive !== false,
        complaintReasons: JSON.stringify(dept.complaintReasons || [])
      },
      create: {
        id: dept.id,
        name: dept.name,
        description: dept.description || '',
        directorId: dept.directorId || null,
        isActive: dept.isActive !== false,
        complaintReasons: JSON.stringify(dept.complaintReasons || [])
      }
    });
  }

  // 2. Seed Users
  console.log(`Seeding ${data.users?.length || 0} users...`);
  for (const u of data.users || []) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        username: u.username || u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        avatar: u.avatar || '',
        role: u.role,
        title: u.title || u.role,
        status: u.status || 'Active',
        password: u.password || '',
        pin: u.pin || '',
        skills: JSON.stringify(u.skills || []),
        departmentId: u.departmentId || null,
        parentId: u.parentId || u.managerId || null,
        managerId: u.managerId || u.parentId || null,
        positionCode: u.positionCode || u.role
      },
      create: {
        id: u.id,
        username: u.username || u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        avatar: u.avatar || '',
        role: u.role,
        title: u.title || u.role,
        status: u.status || 'Active',
        password: u.password || '',
        pin: u.pin || '',
        skills: JSON.stringify(u.skills || []),
        departmentId: u.departmentId || null,
        parentId: u.parentId || u.managerId || null,
        managerId: u.managerId || u.parentId || null,
        positionCode: u.positionCode || u.role
      }
    });
  }

  // 3. Seed Tasks
  console.log(`Seeding ${data.tasks?.length || 0} tasks...`);
  for (const t of data.tasks || []) {
    const deadlineDate = t.deadline ? new Date(t.deadline) : new Date(Date.now() + 86400000);
    const createdAtDate = t.createdAt ? new Date(t.createdAt) : new Date();

    const createdTask = await prisma.task.upsert({
      where: { id: t.id },
      update: {
        title: t.title,
        description: t.description || '',
        priority: t.priority || 'Medium',
        status: t.status || 'Open',
        category: t.category || 'Operations',
        deadline: isNaN(deadlineDate.getTime()) ? new Date() : deadlineDate,
        isOverdue: !!t.isOverdue,
        departmentId: t.departmentId || null,
        creatorId: t.creatorId || t.assignedBy || 'system',
        assignedBy: t.assignedBy || t.creatorId || 'system',
        assigneeId: t.assigneeId || null,
        assigneeIds: JSON.stringify(t.assigneeIds || (t.assigneeId ? [t.assigneeId] : [])),
        lastTransferredById: t.lastTransferredById || null,
        notes: JSON.stringify(t.notes || []),
        version: t.version || 1,
        createdAt: isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate
      },
      create: {
        id: t.id,
        title: t.title,
        description: t.description || '',
        priority: t.priority || 'Medium',
        status: t.status || 'Open',
        category: t.category || 'Operations',
        deadline: isNaN(deadlineDate.getTime()) ? new Date() : deadlineDate,
        isOverdue: !!t.isOverdue,
        departmentId: t.departmentId || null,
        creatorId: t.creatorId || t.assignedBy || 'system',
        assignedBy: t.assignedBy || t.creatorId || 'system',
        assigneeId: t.assigneeId || null,
        assigneeIds: JSON.stringify(t.assigneeIds || (t.assigneeId ? [t.assigneeId] : [])),
        lastTransferredById: t.lastTransferredById || null,
        notes: JSON.stringify(t.notes || []),
        version: t.version || 1,
        createdAt: isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate
      }
    });

    if (t.history && Array.isArray(t.history)) {
      for (const h of t.history) {
        await prisma.taskHistory.upsert({
          where: { id: h.id },
          update: {},
          create: {
            id: h.id,
            taskId: createdTask.id,
            type: h.type || 'note',
            userId: h.userId || 'system',
            userName: h.userName || 'System',
            userAvatar: h.userAvatar || '',
            details: h.details || '',
            timestamp: h.timestamp ? new Date(h.timestamp) : new Date()
          }
        });
      }
    }
  }

  // 4. Seed Checklists
  const allDepartmentChecklists = [
    // IT Department
    {
      id: 'chk-daily-it',
      type: 'Daily',
      title: 'Hotel IT Server Room Inspection',
      description: 'Ensure baseline physical security, environmental conditioning, and critical core interface performance.',
      departmentId: 'it',
      assignedToId: 'ahmed-assistant',
      items: [
        { id: 'daily-it-1', text: 'Verify server room temperature and humidity', completed: true },
        { id: 'daily-it-2', text: 'Confirm nightly backup status', completed: true },
        { id: 'daily-it-3', text: 'Check core switch health indicators', completed: false },
        { id: 'daily-it-4', text: 'Verify UPS status and battery load', completed: true },
        { id: 'daily-it-5', text: 'Check physical access log', completed: false }
      ]
    },
    {
      id: 'chk-weekly-it',
      type: 'Weekly',
      title: 'Hospitality Networks & Firewall Review',
      description: 'Complete auditing scans and optimize critical hotel systems performance metrics.',
      departmentId: 'it',
      assignedToId: null,
      items: [
        { id: 'weekly-it-1', text: 'Review firewall rule alerts and drop logs', completed: true },
        { id: 'weekly-it-2', text: 'Validate switch port health and VLAN segmentation', completed: false },
        { id: 'weekly-it-3', text: 'Review guest Wi-Fi coverage alerts across floors', completed: false },
        { id: 'weekly-it-4', text: 'Verify tamper alarms and network room access', completed: true }
      ]
    },
    {
      id: 'chk-monthly-it',
      type: 'Monthly',
      title: 'Hotel IT Directory & Disaster Audits',
      description: 'Mandatory structural privilege sweeps and business contingency hot-testing workflows.',
      departmentId: 'it',
      assignedToId: 'ahmed-assistant',
      items: [
        { id: 'monthly-it-1', text: 'Review privileged PMS accounts and API keys', completed: true },
        { id: 'monthly-it-2', text: 'Run database restore validation on standby node', completed: true },
        { id: 'monthly-it-3', text: 'Validate POS encryption update schedule', completed: false },
        { id: 'monthly-it-4', text: 'Review disaster recovery contact list and SOPs', completed: false }
      ]
    },
    // Food & Beverage
    {
      id: 'chk-daily-fnb',
      type: 'Daily',
      title: 'Food & Beverage Daily Service Inspection',
      description: 'Check kitchen display systems, POS terminals, and cold room telemetry.',
      departmentId: 'fnb',
      assignedToId: null,
      items: [
        { id: 'daily-fnb-1', text: 'Verify restaurant POS terminal connectivity and receipt printers', completed: false },
        { id: 'daily-fnb-2', text: 'Check kitchen display system (KDS) synchronization', completed: false },
        { id: 'daily-fnb-3', text: 'Log cold room temperature sensors compliance', completed: false },
        { id: 'daily-fnb-4', text: 'Inspect bar mobile ordering tablets battery & status', completed: false }
      ]
    },
    {
      id: 'chk-weekly-fnb',
      type: 'Weekly',
      title: 'Food & Beverage Weekly Equipment Audit',
      description: 'Review outlet kitchen printer spoolers, buffet stations, and inventory hardware.',
      departmentId: 'fnb',
      assignedToId: null,
      items: [
        { id: 'weekly-fnb-1', text: 'Audit kitchen printer spoolers and network routing', completed: false },
        { id: 'weekly-fnb-2', text: 'Validate Micros table layout and menu pricing sync', completed: false },
        { id: 'weekly-fnb-3', text: 'Test barcode inventory scanners and charging docks', completed: false }
      ]
    },
    {
      id: 'chk-monthly-fnb',
      type: 'Monthly',
      title: 'Food & Beverage Monthly Inventory & Compliance',
      description: 'Comprehensive audit of beverage dispensaries, POS terminals, and food hygiene standards.',
      departmentId: 'fnb',
      assignedToId: null,
      items: [
        { id: 'monthly-fnb-1', text: 'Perform monthly physical inventory count sync', completed: false },
        { id: 'monthly-fnb-2', text: 'Inspect food safety logs and HACCP compliance files', completed: false },
        { id: 'monthly-fnb-3', text: 'Verify payment gateway PCI encryption on all POS devices', completed: false }
      ]
    },
    // Rooms Division
    {
      id: 'chk-daily-rooms',
      type: 'Daily',
      title: 'Rooms Division Daily Readiness Checklist',
      description: 'Inspect front desk keycard encoders, guest Wi-Fi portal, and housekeeping sync.',
      departmentId: 'rooms',
      assignedToId: null,
      items: [
        { id: 'daily-rooms-1', text: 'Test front desk RFID keycard encoder stations', completed: false },
        { id: 'daily-rooms-2', text: 'Verify lobby guest Wi-Fi captive portal authentication', completed: false },
        { id: 'daily-rooms-3', text: 'Test guest room interactive IPTV welcome channel', completed: false },
        { id: 'daily-rooms-4', text: 'Verify housekeeping mobile app room status sync', completed: false }
      ]
    },
    {
      id: 'chk-weekly-rooms',
      type: 'Weekly',
      title: 'Rooms Division Weekly Facility Audit',
      description: 'Review floor switch cabinets, room PBX extensions, and electronic door locks.',
      departmentId: 'rooms',
      assignedToId: null,
      items: [
        { id: 'weekly-rooms-1', text: 'Inspect guest floor sub-switch rack ventilation and locks', completed: false },
        { id: 'weekly-rooms-2', text: 'Test guest room PBX emergency phone speed dials', completed: false },
        { id: 'weekly-rooms-3', text: 'Generate low battery report for VingCard door locks', completed: false }
      ]
    },
    {
      id: 'chk-monthly-rooms',
      type: 'Monthly',
      title: 'Rooms Division Monthly Systems & Hardware Review',
      description: 'Complete inspection of guest room management systems and PMS integration.',
      departmentId: 'rooms',
      assignedToId: null,
      items: [
        { id: 'monthly-rooms-1', text: 'Audit guest room climate control telemetry sensors', completed: false },
        { id: 'monthly-rooms-2', text: 'Test PMS room dirty/clean automatic status update interface', completed: false },
        { id: 'monthly-rooms-3', text: 'Run full backup of door lock database server', completed: false }
      ]
    },
    // Operations
    {
      id: 'chk-daily-operations',
      type: 'Daily',
      title: 'Operations Daily Security & Facility Tour',
      description: 'Tour main hotel facilities, security gates, CCTV recording, and dispatch channels.',
      departmentId: 'operations',
      assignedToId: null,
      items: [
        { id: 'daily-ops-1', text: 'Inspect main entrance automatic gates and barriers', completed: false },
        { id: 'daily-ops-2', text: 'Check CCTV surveillance recording matrix across all cameras', completed: false },
        { id: 'daily-ops-3', text: 'Test Duty Manager mobile dispatch app and radio bridge', completed: false }
      ]
    },
    {
      id: 'chk-weekly-operations',
      type: 'Weekly',
      title: 'Operations Weekly Life Safety & Communications',
      description: 'Inspect fire alarm panel interfaces, public address systems, and backup generators.',
      departmentId: 'operations',
      assignedToId: null,
      items: [
        { id: 'weekly-ops-1', text: 'Verify fire alarm panel network integration and telemetry', completed: false },
        { id: 'weekly-ops-2', text: 'Test emergency Public Address (PA) system zones', completed: false },
        { id: 'weekly-ops-3', text: 'Verify emergency power generator auto-switch telemetry', completed: false }
      ]
    },
    {
      id: 'chk-monthly-operations',
      type: 'Monthly',
      title: 'Operations Monthly Facility Master Audit',
      description: 'Comprehensive audit of building management system (BMS) and control consoles.',
      departmentId: 'operations',
      assignedToId: null,
      items: [
        { id: 'monthly-ops-1', text: 'Audit building management system (BMS) automation schedules', completed: false },
        { id: 'monthly-ops-2', text: 'Test UHF radio communications repeater station', completed: false },
        { id: 'monthly-ops-3', text: 'Master audit of emergency response control room console', completed: false }
      ]
    }
  ];

  console.log(`Seeding ${allDepartmentChecklists.length} department checklists...`);
  for (const c of allDepartmentChecklists) {
    await prisma.checklist.upsert({
      where: { id: c.id },
      update: {
        type: c.type,
        title: c.title,
        description: c.description || '',
        departmentId: c.departmentId,
        assignedToId: c.assignedToId,
        items: JSON.stringify(c.items || []),
        version: 1
      },
      create: {
        id: c.id,
        type: c.type,
        title: c.title,
        description: c.description || '',
        departmentId: c.departmentId,
        assignedToId: c.assignedToId,
        items: JSON.stringify(c.items || []),
        version: 1
      }
    });
  }

  // 5. Seed Projects
  console.log(`Seeding ${data.projects?.length || 0} projects...`);
  for (const p of data.projects || []) {
    const deadlineDate = p.deadline ? new Date(p.deadline) : null;
    await prisma.project.upsert({
      where: { id: p.id },
      update: {
        name: p.name || p.title || 'Project',
        description: p.description || '',
        progress: p.progress || 0,
        managerId: p.managerId || null,
        teamIds: JSON.stringify(p.teamIds || []),
        milestones: JSON.stringify(p.milestones || []),
        documents: JSON.stringify(p.documents || []),
        deadline: deadlineDate && !isNaN(deadlineDate.getTime()) ? deadlineDate : null,
        delayStatus: !!p.delayStatus,
        notes: JSON.stringify(p.notes || []),
        version: p.version || 1
      },
      create: {
        id: p.id,
        name: p.name || p.title || 'Project',
        description: p.description || '',
        progress: p.progress || 0,
        managerId: p.managerId || null,
        teamIds: JSON.stringify(p.teamIds || []),
        milestones: JSON.stringify(p.milestones || []),
        documents: JSON.stringify(p.documents || []),
        deadline: deadlineDate && !isNaN(deadlineDate.getTime()) ? deadlineDate : null,
        delayStatus: !!p.delayStatus,
        notes: JSON.stringify(p.notes || []),
        version: p.version || 1
      }
    });
  }

  // 6. Seed Notifications
  console.log(`Seeding ${data.notifications?.length || 0} notifications...`);
  for (const n of data.notifications || []) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {
        recipientUserId: n.recipientUserId || '',
        title: n.title,
        message: n.message || '',
        category: n.category || 'System',
        isRead: !!n.isRead,
        acknowledgedAt: n.acknowledgedAt ? new Date(n.acknowledgedAt) : null,
        eventKey: n.eventKey || null,
        channels: JSON.stringify(n.channels || {})
      },
      create: {
        id: n.id,
        recipientUserId: n.recipientUserId || '',
        title: n.title,
        message: n.message || '',
        category: n.category || 'System',
        isRead: !!n.isRead,
        acknowledgedAt: n.acknowledgedAt ? new Date(n.acknowledgedAt) : null,
        eventKey: n.eventKey || null,
        channels: JSON.stringify(n.channels || {})
      }
    });
  }

  console.log('Database seeding successfully completed!');
}

main()
  .catch(e => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
