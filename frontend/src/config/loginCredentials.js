/**
 * Demo usernames for local UAT (passwords are NOT stored in the frontend).
 * Seed via backend/scripts/apply-subsidiary-schema.js
 *
 * Default seed password: eics@4321 (EICS_SEED_PASSWORD on server)
 */
export const DEMO_ACCOUNTS = [
  {
    username: 'admin.india@eicscomp.com',
    role: 'ADMIN',
    subsidiaryId: 'india',
    label: 'Akshay Nair · Admin · India',
  },
  {
    username: 'admin.uae@eicscomp.com',
    role: 'ADMIN',
    subsidiaryId: 'uae',
    label: 'Ali Md · Admin · UAE',
  },
  {
    username: 'admin.saudi@eicscomp.com',
    role: 'ADMIN',
    subsidiaryId: 'saudi',
    label: 'Rahul Kumar · Admin · Saudi',
  },
  {
    username: 'hr.india@eicscomp.com',
    role: 'HR',
    subsidiaryId: 'india',
    label: 'Divya · HR · India',
  },
  {
    username: 'hr.uae@eicscomp.com',
    role: 'HR',
    subsidiaryId: 'uae',
    label: 'Shreya · HR · UAE',
  },
  {
    username: 'hr.saudi@eicscomp.com',
    role: 'HR',
    subsidiaryId: 'saudi',
    label: 'Shaik Zayed · HR · Saudi',
  },
  {
    username: 'hod.india@eicscomp.com',
    role: 'HOD',
    subsidiaryId: 'india',
    label: 'Sravan Kumar.V · HOD · India',
  },
  {
    username: 'hod.uae@eicscomp.com',
    role: 'HOD',
    subsidiaryId: 'uae',
    label: 'Sashi · HOD · UAE',
  },
  {
    username: 'hod.saudi@eicscomp.com',
    role: 'HOD',
    subsidiaryId: 'saudi',
    label: 'Vyshnav · HOD · Saudi',
  },
  {
    username: 'employee.india@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiaryId: 'india',
    label: 'Nikhitha · Employee · India',
  },
  {
    username: 'employee.uae@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiaryId: 'uae',
    label: 'Saleem · Employee · UAE',
  },
  {
    username: 'employee.saudi@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiaryId: 'saudi',
    label: 'Mudasiir · Employee · Saudi',
  },
]

/** @deprecated use DEMO_ACCOUNTS */
export const DEMO_USERNAMES = DEMO_ACCOUNTS.map((a) => a.username)
