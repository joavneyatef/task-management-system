async function testHttpFlow() {
  console.log('--- TESTING HTTP END-TO-END ASSISTANT COMPLETION & DIRECTOR VISIBILITY ---');
  const baseUrl = 'http://localhost:3000';

  // 1. Login as George (Director)
  const georgeLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'george@gmail.com', password: 'ComplexPassword@123' })
  });
  const georgeCookie = georgeLoginRes.headers.get('set-cookie')?.split(';')[0] || '';
  const georgeData = await georgeLoginRes.json();
  console.log('1. George Login:', georgeData.success ? 'SUCCESS' : 'FAILED', 'Cookie:', !!georgeCookie);

  // 2. Login as Jovaney (Assistant)
  const jovaneyLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'jovaneyatef@gmail.com', password: 'ComplexPassword@123' })
  });
  const jovaneyCookie = jovaneyLoginRes.headers.get('set-cookie')?.split(';')[0] || '';
  const jovaneyData = await jovaneyLoginRes.json();
  console.log('2. Jovaney Login:', jovaneyData.success ? 'SUCCESS' : 'FAILED', 'Cookie:', !!jovaneyCookie);

  if (!georgeData.success || !jovaneyData.success) {
    console.error('Login failed! George:', georgeData, 'Jovaney:', jovaneyData);
    process.exit(1);
  }

  // 3. George creates a task assigned to Jovaney
  const taskId = `task-e2e-${Date.now()}`;
  const now = new Date().toISOString();
  const georgeStateRes = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: georgeCookie }
  });
  const currentGeorgeState = await georgeStateRes.json();

  const newTask = {
    id: taskId,
    title: 'E2E Complete & Status Change Verification',
    description: 'Verify state transitions from Jovaney Assistant to George Director',
    priority: 'High',
    status: 'Open',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    departmentId: 'it',
    createdBy: georgeData.user.id,
    assignedBy: georgeData.user.id,
    assigneeId: jovaneyData.user.id,
    assigneeIds: [jovaneyData.user.id],
    version: 1,
    notes: [],
    attachments: [],
    history: []
  };

  const georgeCreateRes = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: georgeCookie },
    body: JSON.stringify({
      ...currentGeorgeState,
      tasks: [newTask, ...(currentGeorgeState.tasks || [])]
    })
  });
  console.log('3. George Dispatch Task HTTP Status:', georgeCreateRes.status);
  const createdState = await georgeCreateRes.json();
  const createdTask = createdState.tasks?.find((t: any) => t.id === taskId);
  console.log('   Task Created Status:', createdTask?.status);

  // 4. Jovaney fetches state and sees the task
  const jovaneyGetRes = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: jovaneyCookie }
  });
  const jovaneyState = await jovaneyGetRes.json();
  const jovaneyTask = jovaneyState.tasks?.find((t: any) => t.id === taskId);
  console.log('4. Jovaney Views Task Status:', jovaneyTask?.status);

  // 5. Jovaney starts the task (In Progress)
  const inProgressTask = {
    ...jovaneyTask,
    status: 'In Progress',
    startedAt: now,
    version: 2
  };
  const jovaneyStartRes = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jovaneyCookie },
    body: JSON.stringify({
      ...jovaneyState,
      tasks: jovaneyState.tasks.map((t: any) => t.id === taskId ? inProgressTask : t)
    })
  });
  console.log('5. Jovaney Start Task HTTP Status:', jovaneyStartRes.status);

  // 6. Jovaney completes the task (Completed)
  const completedTask = {
    ...inProgressTask,
    status: 'Completed',
    completedAt: now,
    completedById: jovaneyData.user.id,
    actualDurationSec: 60,
    version: 3
  };
  const jovaneyCompleteRes = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jovaneyCookie },
    body: JSON.stringify({
      ...jovaneyState,
      tasks: jovaneyState.tasks.map((t: any) => t.id === taskId ? completedTask : t)
    })
  });
  console.log('6. Jovaney Complete Task HTTP Status:', jovaneyCompleteRes.status);
  const completedResponseState = await jovaneyCompleteRes.json();
  const verifyCompleted = completedResponseState.tasks?.find((t: any) => t.id === taskId);
  console.log('   Jovaney Response Task Status:', verifyCompleted?.status);

  // 7. George fetches state and verifies status is 'Completed'
  const georgeFinalRes = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: georgeCookie }
  });
  const georgeFinalState = await georgeFinalRes.json();
  const georgeTaskView = georgeFinalState.tasks?.find((t: any) => t.id === taskId);
  console.log('7. George Account Final Status:', georgeTaskView?.status);

  // 8. Result Check
  if (georgeTaskView?.status === 'Completed' && verifyCompleted?.status === 'Completed') {
    console.log('\n🎉 ALL CHECKS PASSED: Task completed by Assistant successfully switched to COMPLETED in Director George account and SQLite DB!');
  } else {
    console.error('\n❌ FAILURE: Task status did not switch to Completed! George saw:', georgeTaskView?.status);
    process.exit(1);
  }
}

testHttpFlow().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
