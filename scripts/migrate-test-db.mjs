import 'dotenv/config' with { path: '.env.test' };
import { execSync } from 'child_process';

execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });