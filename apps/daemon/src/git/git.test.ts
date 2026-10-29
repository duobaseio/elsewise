import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { TestRepo } from '../../test/git/repo';
import { Git } from './git';

let repo: TestRepo;

beforeEach(async () => {
  repo = await TestRepo.create();
});

afterEach(() => repo.remove());

test('returns stdout and keeps the final newline', async () => {
  await expect(repo.git.run(['rev-parse', '--git-dir'])).resolves.toEqual(Buffer.from('.git\n'));
  await expect(repo.git.text(['rev-parse', '--git-dir'])).resolves.toBe('.git\n');
});

test('sets overriding environment variables', async () => {
  await expect(repo.git.text(['var', 'GIT_EDITOR'])).resolves.toBe('true\n');
  const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'x.y', GIT_CONFIG_VALUE_0: 'z' };
  await expect(repo.git.text(['config', '--get', 'x.y'], { env })).resolves.toBe('z\n');
});

test('feeds stdin', async () => {
  const hash = 'ce013625030ba8dba906f756967f9e9ca394464a';
  await expect(repo.git.text(['hash-object', '--stdin'], { stdin: 'hello\n' })).resolves.toBe(`${hash}\n`);
});

test('accepts only the exit codes given', async () => {
  const args = ['rev-parse', '--verify', '--quiet', 'nope'];
  await expect(repo.git.text(args, { exitCodes: [0, 1] })).resolves.toBe('');
  await expect(repo.git.text(args)).rejects.toMatchObject({ name: 'GitError', exitCode: 1 });
  await expect(repo.git.text(['rev-parse', '--verify', 'nope'])).rejects.toMatchObject({
    exitCode: 128,
    message: 'Needed a single revision',
  });
});

test('passes stderr on as it arrives', async () => {
  const chunks: Buffer[] = [];
  const onStderr = (chunk: Buffer) => chunks.push(chunk);
  await repo.git.run(['rev-parse', '--verify', 'nope'], { onStderr, exitCodes: [128] });
  expect(Buffer.concat(chunks).toString()).toBe('fatal: Needed a single revision\n');
});

test('fails with RESOURCE_EXHAUSTED past the read limit', async () => {
  const call = new Git(repo.nativeRoot, 4).run(['hash-object', '--stdin'], { stdin: 'x' });
  await expect(call).rejects.toMatchObject({ name: 'TransportError', code: Code.RESOURCE_EXHAUSTED });
});

test('fails with CANCELLED when the signal aborts', async () => {
  const abort = new AbortController();
  const call = repo.git.run(['hash-object', '--stdin'], { signal: abort.signal }); // Waits on stdin.
  setTimeout(() => abort.abort(), 20);
  await expect(call).rejects.toMatchObject({ name: 'TransportError', code: Code.CANCELLED });
});

test('fails with FAILED_PRECONDITION when git is not installed', async () => {
  await expect(repo.git.run(['version'], { env: { PATH: '' } })).rejects.toMatchObject({
    code: Code.FAILED_PRECONDITION,
    message: 'git is not installed on the daemon machine',
  });
});
