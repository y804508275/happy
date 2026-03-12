import { E2BSandbox } from '../e2b';

async function main() {
    console.log('=== E2B Smoke Test ===\n');

    const sandbox = new E2BSandbox();

    try {
        // 1. Create sandbox
        console.log('1. Creating sandbox...');
        await sandbox.init();
        console.log(`   OK - sandbox ID: ${sandbox.sandboxId}\n`);

        // 2. Run command
        console.log('2. Running command...');
        const cmdResult = await sandbox.runCommand('echo "Hello from E2B" && python3 --version && node --version');
        console.log(`   stdout: ${cmdResult.stdout.trim()}`);
        console.log(`   exit code: ${cmdResult.exitCode}\n`);

        // 3. File write
        console.log('3. Writing file...');
        await sandbox.fileWrite('/tmp/test.txt', 'Hello from Happy Capabilities!');
        console.log('   OK\n');

        // 4. File read
        console.log('4. Reading file...');
        const content = await sandbox.fileRead('/tmp/test.txt');
        console.log(`   Content: "${content}"`);
        console.log(`   Match: ${content === 'Hello from Happy Capabilities!' ? 'YES' : 'NO'}\n`);

        // 5. File list
        console.log('5. Listing /tmp...');
        const files = await sandbox.fileList('/tmp');
        console.log(`   Files: ${files.join(', ')}\n`);

        // 6. Stream URL
        console.log('6. Stream URL...');
        console.log(`   URL: ${sandbox.getStreamUrl()}\n`);

        console.log('7. Browser navigate (desktop mode with screenshot)...');
        const nav = await sandbox.browserNavigate('https://example.com');
        console.log(`   Title: "${nav.title}"`);
        console.log(`   Text length: ${nav.text.length} chars`);
        console.log(`   Has screenshot: ${nav.screenshotBase64 !== null}`);
        if (nav.screenshotBase64) {
            console.log(`   Screenshot size: ${nav.screenshotBase64.length} bytes base64`);
        }
        console.log(`   Text preview: "${nav.text.slice(0, 100)}..."\n`);

        console.log('=== All tests passed ===');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    } finally {
        await sandbox.close();
        console.log('Sandbox closed.');
    }
}

main();
