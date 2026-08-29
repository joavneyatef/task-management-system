import prisma from '../db';
import { Notification } from '../../src/types';

export async function runAutoRedistribution() {
  const onLeaveUsers = await prisma.user.findMany({
    where: { status: 'On Leave' }
  });

  if (onLeaveUsers.length === 0) return;

  const onLeaveUserIds = onLeaveUsers.map(u => u.id);

  const availableStaff = await prisma.user.findMany({
    where: { role: 'Coordinator', status: 'Active' }
  });
  const fallbackAssignee = availableStaff.length > 0 ? availableStaff[0] : null;

  // Find open tasks assigned to on-leave users
  const tasksToRedistribute = await prisma.task.findMany({
    where: {
      status: { not: 'Completed' },
      assigneeId: { in: onLeaveUserIds }
    }
  });

  for (const task of tasksToRedistribute) {
    const oldAssignee = onLeaveUsers.find(u => u.id === task.assigneeId)?.name || 'Deactivated Staff';
    const notes: string[] = task.notes ? JSON.parse(task.notes) : [];
    notes.push(
      `REDISTRIBUTION: Auto-transferred task from ${oldAssignee} to ${
        fallbackAssignee ? fallbackAssignee.name : 'Unassigned pool'
      } due to leave schedule status update.`
    );

    await prisma.task.update({
      where: { id: task.id },
      data: {
        assigneeId: fallbackAssignee ? fallbackAssignee.id : null,
        assigneeIds: JSON.stringify(fallbackAssignee ? [fallbackAssignee.id] : []),
        notes: JSON.stringify(notes)
      }
    });

    // Create notification
    await prisma.notification.create({
      data: {
        id: `notif-redist-${Date.now()}-${Math.random()}`,
        recipientUserId: fallbackAssignee ? fallbackAssignee.id : '',
        title: `Task Re-assigned: ${task.title}`,
        message: `${task.title} was automatically redistributed to ${
          fallbackAssignee ? fallbackAssignee.name : 'the Open Pool'
        } as original assignee registered for Leave.`,
        category: 'Task',
        createdAt: new Date(),
        isRead: false,
        channels: JSON.stringify({ inApp: true, telegram: true, email: true })
      }
    });
  }

  // Redistribute checklists
  const checklistsToRedistribute = await prisma.checklist.findMany({
    where: { assignedToId: { in: onLeaveUserIds } }
  });

  for (const chk of checklistsToRedistribute) {
    const nextAvailable = availableStaff.find(u => u.id !== chk.assignedToId) || fallbackAssignee;
    await prisma.checklist.update({
      where: { id: chk.id },
      data: {
        assignedToId: nextAvailable ? nextAvailable.id : null
      }
    });
  }
}
