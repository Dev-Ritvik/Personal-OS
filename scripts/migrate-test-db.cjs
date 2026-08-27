require('dotenv').config({path:'.env.test'});
const { execSync } = require('child_process');
execSync('pnpm exec prisma migrate deploy', {stdio:'inherit'});