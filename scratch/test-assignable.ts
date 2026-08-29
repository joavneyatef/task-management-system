import { getAssignableUsers } from '../src/utils/permissions';
import { getSystemState } from '../server/services/stateService';

async function test() {
  const state = await getSystemState(true);
  
  // Find George Director account (both seed or newly created)
  const georgeAccounts = state.users.filter(u => u.role === 'Director' && u.departmentId === 'it');
  
  for (const george of georgeAccounts) {
    console.log(`\n=== Testing for Director: ${george.name} (id: ${george.id}) ===`);
    const assignable = getAssignableUsers(george, state.users);
    console.log('Total assignable users:', assignable.length);
    console.log('Assignable users names:', assignable.map(u => `${u.name} (${u.role}, ${u.departmentId})`));
  }

  // Find a Manager account in IT
  const matar = state.users.find(u => u.id === 'matar-manager')!;
  console.log(`\n=== Testing for Manager: ${matar.name} ===`);
  const matarAssignable = getAssignableUsers(matar, state.users);
  console.log('Total assignable users:', matarAssignable.length);
  console.log('Assignable users names:', matarAssignable.map(u => `${u.name} (${u.role}, ${u.departmentId})`));
}

test();
