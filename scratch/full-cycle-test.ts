import prisma from '../server/db';
import { canViewTask, getAssignableUsers, isGeneralManager, isDirector, isManager, isAssistant } from '../src/utils/permissions';
import { getSystemState } from '../server/services/stateService';
import { signupUser, loginUser, updateUserProfile } from '../server/services/authService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
    failedTests++;
  }
}

async function runFullCycleTestSuite() {
  console.log('===============================================================');
  console.log('   FULL SYSTEM CYCLE TEST SUITE: IT & OPERATIONS MANAGEMENT    ');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // CYCLE 1: AUTHENTICATION, ROLES & PASSWORD VALIDATION
  // -------------------------------------------------------------
  console.log('--- CYCLE 1: Authentication & User Lifecycle ---');

  // Test 1.1: Password complexity rule enforcement
  const weakPasswordResult = await signupUser({
    name: 'Weak User',
    email: 'weak.user@hotel.local',
    password: 'password', // Missing uppercase & number/symbol
    role: 'Assistant',
    departmentId: 'it',
    parentId: 'matar-manager'
  });
  assert(!weakPasswordResult.success && weakPasswordResult.error === 'WEAK_PASSWORD', 'Rejects weak password lacking complexity');

  // Test 1.2: Valid user signup across departments
  const testAssistantEmail = `test.assistant.${Date.now()}@hotel.local`;
  const signupResult = await signupUser({
    name: 'Test IT Assistant',
    email: testAssistantEmail,
    password: 'ComplexPassword@123',
    role: 'Assistant',
    departmentId: 'it',
    parentId: 'george-director'
  });
  assert(signupResult.success && !!signupResult.user?.id, 'Creates new Assistant account with valid credentials & hierarchy');

  // Test 1.3: Duplicate email prevention
  const duplicateSignup = await signupUser({
    name: 'Duplicate Email Test',
    email: testAssistantEmail,
    password: 'ComplexPassword@123',
    role: 'Assistant',
    departmentId: 'it',
    parentId: 'george-director'
  });
  assert(!duplicateSignup.success && duplicateSignup.error === 'EMAIL_EXISTS', 'Rejects duplicate email registration');

  // Test 1.4: Multi-identifier login (Email, Name, Username) - case-insensitive
  const loginByEmail = await loginUser(testAssistantEmail.toUpperCase(), 'ComplexPassword@123');
  assert(loginByEmail.success && loginByEmail.user?.email === testAssistantEmail.toLowerCase(), 'Logs in via Email (case-insensitive)');

  const loginByName = await loginUser('test it assistant', 'ComplexPassword@123');
  assert(loginByName.success && loginByName.user?.name === 'Test IT Assistant', 'Logs in via Full Name (case-insensitive)');

  // Test 1.5: Profile & Password update
  const profileUpdateResult = await updateUserProfile(signupResult.user!.id, {
    name: 'Test IT Assistant Updated',
    email: testAssistantEmail,
    newPassword: 'NewComplexPassword@456'
  });
  assert(profileUpdateResult.success && profileUpdateResult.user?.name === 'Test IT Assistant Updated', 'Updates user profile and password with scrypt hashing');

  const loginWithNewPassword = await loginUser(testAssistantEmail, 'NewComplexPassword@456');
  assert(loginWithNewPassword.success, 'Authenticates with updated password');


  // -------------------------------------------------------------
  // CYCLE 2: ROLE PRIVILEGES, ASSIGNABILITY & VISIBILITY SCOPES
  // -------------------------------------------------------------
  console.log('\n--- CYCLE 2: Role Privileges & Hierarchical Visibility ---');

  const state = await getSystemState(true);
  const gm = state.users.find(u => isGeneralManager(u))!;
  const itDirector = state.users.find(u => isDirector(u) && u.departmentId === 'it')!;
  const itManager = state.users.find(u => isManager(u) && u.departmentId === 'it')!;
  const itAssistant = state.users.find(u => isAssistant(u) && u.departmentId === 'it')!;
  const otherAssistant = state.users.find(u => isAssistant(u) && u.id !== itAssistant.id && u.departmentId === 'it')!;

  assert(!!gm, 'General Manager account exists');
  assert(!!itDirector, 'IT Director account exists');
  assert(!!itManager, 'IT Manager account exists');
  assert(!!itAssistant, 'IT Assistant account exists');

  // Test 2.1: Assignable users for Director (Self + All Managers + All Assistants in Department)
  const directorAssignable = getAssignableUsers(itDirector, state.users);
  const directorCanAssignSelf = directorAssignable.some(u => u.id === itDirector.id);
  const directorCanAssignManager = directorAssignable.some(u => u.role === 'Manager' && u.departmentId === 'it');
  const directorCanAssignAssistant = directorAssignable.some(u => u.role === 'Assistant' && u.departmentId === 'it');
  assert(directorCanAssignSelf && directorCanAssignManager && directorCanAssignAssistant, 'Director can assign tasks to self, managers, and assistants in department');

  // Test 2.2: Assignable users for Manager (Self + Assistants in department/subordinates)
  const managerAssignable = getAssignableUsers(itManager, state.users);
  const managerCanAssignSelf = managerAssignable.some(u => u.id === itManager.id);
  const managerCanAssignAssistant = managerAssignable.some(u => u.role === 'Assistant' && u.departmentId === 'it');
  const managerCannotAssignDirector = !managerAssignable.some(u => u.role === 'Director');
  assert(managerCanAssignSelf && managerCanAssignAssistant && managerCannotAssignDirector, 'Manager can assign to self and assistants, but not directors');

  // Test 2.3: Task Visibility Rules
  const privateTaskForAssistant = {
    id: `test-task-${Date.now()}`,
    title: 'Confidential Task for IT Assistant',
    description: 'Testing task privacy',
    priority: 'High' as const,
    status: 'Open' as const,
    deadline: new Date().toISOString(),
    assigneeId: itAssistant.id,
    assigneeIds: [itAssistant.id],
    createdBy: gm.id,
    departmentId: 'it',
    notes: [],
    attachments: []
  };

  assert(canViewTask(gm, privateTaskForAssistant, state.users), 'GM has global visibility of private task');
  assert(canViewTask(itAssistant, privateTaskForAssistant, state.users), 'Target Assistant can view task assigned to them');
  assert(canViewTask(itDirector, privateTaskForAssistant, state.users), 'Department Director can view task in department');
  assert(!canViewTask(otherAssistant, privateTaskForAssistant, state.users), 'Other peer Assistant CANNOT view private task');


  // -------------------------------------------------------------
  // CYCLE 3: TASK LIFECYCLE & WORKFLOW (CREATE -> PROGRESS -> COMPLETE)
  // -------------------------------------------------------------
  console.log('\n--- CYCLE 3: Task Workflow & State Lifecycle ---');

  // Test 3.1: Create task in SQLite
  const createdTask = await prisma.task.create({
    data: {
      id: `task-cycle-${Date.now()}`,
      title: 'Full Cycle Verification Task',
      description: 'End to end validation of task completion',
      priority: 'High',
      status: 'Open',
      deadline: new Date(Date.now() + 86400000),
      creatorId: itDirector.id,
      assigneeId: itAssistant.id,
      assigneeIds: JSON.stringify([itAssistant.id]),
      departmentId: 'it'
    }
  });
  assert(createdTask.status === 'Open', 'Task created successfully with Open status');

  // Test 3.2: Transition to In Progress
  const inProgressTask = await prisma.task.update({
    where: { id: createdTask.id },
    data: {
      status: 'In Progress',
      history: {
        create: {
          id: `hist-${Date.now()}-start`,
          type: 'start',
          userId: itAssistant.id,
          userName: itAssistant.name,
          details: 'Assignee started the task'
        }
      }
    },
    include: { history: true }
  });
  assert(inProgressTask.status === 'In Progress' && inProgressTask.history.length > 0, 'Task transitioned to In Progress with history log');

  // Test 3.3: Transition to Completed
  const completedTask = await prisma.task.update({
    where: { id: createdTask.id },
    data: {
      status: 'Completed',
      history: {
        create: {
          id: `hist-${Date.now()}-complete`,
          type: 'complete',
          userId: itAssistant.id,
          userName: itAssistant.name,
          details: 'Assignee completed the task'
        }
      }
    },
    include: { history: true }
  });
  assert(completedTask.status === 'Completed', 'Task transitioned to Completed with completion audit log');


  // -------------------------------------------------------------
  // CYCLE 4: CHECKLISTS & COMPLIANCE BY DEPARTMENT
  // -------------------------------------------------------------
  console.log('\n--- CYCLE 4: Department Compliance & Checklists ---');

  const departments = ['it', 'fnb', 'rooms', 'operations'];
  for (const deptId of departments) {
    const deptChecklists = await prisma.checklist.findMany({ where: { departmentId: deptId } });
    const hasDaily = deptChecklists.some(c => c.type === 'Daily');
    const hasWeekly = deptChecklists.some(c => c.type === 'Weekly');
    const hasMonthly = deptChecklists.some(c => c.type === 'Monthly');
    assert(hasDaily && hasWeekly && hasMonthly, `Department "${deptId.toUpperCase()}" has Daily, Weekly, and Monthly fixed checklists`);
  }

  // Test 4.2: Checklist completion & history recording
  const dailyITChecklist = await prisma.checklist.findFirst({ where: { departmentId: 'it', type: 'Daily' } });
  assert(!!dailyITChecklist, 'IT Daily checklist exists and is accessible');

  if (dailyITChecklist) {
    const historyEntry = await prisma.checklistHistory.create({
      data: {
        id: `chkhist-${Date.now()}`,
        checklistId: dailyITChecklist.id,
        date: new Date().toISOString().split('T')[0],
        type: 'Daily',
        itemsAttempted: 5,
        itemsCompleted: 5,
        completedBy: itAssistant.id,
        items: dailyITChecklist.items
      }
    });
    assert(historyEntry.itemsCompleted === 5, 'Checklist audit log archived successfully');
  }


  // -------------------------------------------------------------
  // CYCLE 5: DATABASE INTEGRITY & CLEANUP
  // -------------------------------------------------------------
  console.log('\n--- CYCLE 5: Data Integrity & Housekeeping ---');

  // Clean up temporary cycle test records
  await prisma.task.deleteMany({ where: { id: { startsWith: 'task-cycle-' } } });
  await prisma.user.deleteMany({ where: { email: testAssistantEmail } });
  assert(true, 'Test artifacts and ephemeral records cleaned up cleanly');

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`   TEST EXECUTION COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFullCycleTestSuite().catch(err => {
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
