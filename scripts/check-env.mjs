const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.error(`Missing required public build environment variable(s): ${missing.join(', ')}`);
  console.error('Set them in .env.local for development and in Vercel Project Settings for deployments.');
  process.exit(1);
}

const forbiddenPublicVariableNames = Object.keys(process.env).filter(
  (name) => name.startsWith('VITE_') && /(service[_-]?role|secret|private[_-]?key|admin[_-]?key)/i.test(name),
);
if (forbiddenPublicVariableNames.length) {
  console.error(`Potential server secret exposed through Vite: ${forbiddenPublicVariableNames.join(', ')}`);
  console.error('Never prefix Supabase service-role or secret keys with VITE_.');
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL.trim();
let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(supabaseUrl);
} catch {
  console.error('VITE_SUPABASE_URL must be an absolute URL.');
  process.exit(1);
}
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
if (parsedSupabaseUrl.protocol !== 'https:' && !(parsedSupabaseUrl.protocol === 'http:' && localHosts.has(parsedSupabaseUrl.hostname))) {
  console.error('VITE_SUPABASE_URL must use HTTPS except for a local development URL.');
  process.exit(1);
}

const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
if (!publicKey || /^sb_secret_/i.test(publicKey) || /service[_-]?role/i.test(publicKey)) {
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY must contain only a Supabase publishable/anon key, never a secret/service-role key.');
  process.exit(1);
}

// Legacy Supabase anon/service-role keys are JWTs. When decodable, reject the
// service-role token as well, even if someone accidentally puts it in the
// publishable-key variable.
const tokenParts = publicKey.split('.');
if (tokenParts.length === 3) {
  try {
    const claims = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'));
    if (claims.role === 'service_role') {
      console.error('The Supabase service_role token cannot be used in a VITE_ variable.');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('VITE_SUPABASE_PUBLISHABLE_KEY looks like a malformed JWT.');
      process.exit(1);
    }
  }
}

const publicAppUrl = process.env.VITE_PUBLIC_APP_URL?.trim();
if (publicAppUrl) {
  try {
    const parsedPublicUrl = new URL(publicAppUrl);
    if (parsedPublicUrl.protocol !== 'https:' && !(parsedPublicUrl.protocol === 'http:' && localHosts.has(parsedPublicUrl.hostname))) {
      throw new Error('Protocol must be HTTPS outside local development.');
    }
  } catch {
    console.error('VITE_PUBLIC_APP_URL must be a valid absolute HTTPS URL (or localhost URL for local development).');
    process.exit(1);
  }
}

console.log('Public environment configuration validated.');
