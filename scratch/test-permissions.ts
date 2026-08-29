import { canViewTask, isGeneralManager } from '../src/utils/permissions';
import { getSystemState } from '../server/services/stateService';

async function test() {
  const state = await getSystemState(true);
  console.log('Total users:', state.users.length);
  console.log('Total checklists:', state.checklists.length);

  // Checklists by department
  const itChecklists = state.checklists.filter(c => c.departmentId === 'it');
  const fnbChecklists = state.checklists.filter(c => c.departmentId === 'fnb');
  console.log('IT Checklists count:', itChecklists.length);
  console.log('F&B Checklists count:', fnbChecklists.length);

  // Test Task Visibility
  const gmUser = state.users.find(u => u.id === 'hany-gm')!;
  const ahmedAssistant = state.users.find(u => u.id === 'ahmed-assistant')!;
  const matarManager = state.users.find(u => u.id === 'matar-manager')!;
  const khaledAssistant = state.users.find(u => u.id === 'khaled-assistant')!;

  // Simulated task assigned by GM to Ahmed Assistant
  const gmTask = {
    id: 'test-task-1',
    title: 'Secret GM task for Ahmed',
    description: 'Test',
    priority: 'High' as any,
    status: 'Open' as any,
    deadline: new Date().toISOString(),
    assigneeId: 'ahmed-assistant',
    assigneeIds: ['ahmed-assistant'],
    createdBy: 'hany-gm',
    departmentId: 'it',
    notes: [],
    attachments: []
  };

  console.log('GM can view:', canViewTask(gmUser, gmTask, state.users));
  console.log('Ahmed Assistant (assignee) can view:', canViewTask(ahmedAssistant, gmTask, state.users));
  console.log('Matar Manager (supervisor) can view:', canViewTask(matarManager, gmTask, state.users));
  console.log('Khaled Assistant (peer) can view:', canViewTask(khaledAssistant, gmTask, state.users));
}
test();
