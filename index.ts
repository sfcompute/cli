import { Command } from 'commander';
import ora from 'ora';
import { exec } from 'node:child_process';
import { postSession, getSession, generateValidationString } from './login';
import { loadConfig, saveConfig } from './config';

const program = new Command();

program
    .name('sfc')
    .description('San Francisco Compute command line tool')
    .version('1.0.0');


program
    .command('login')
    .description('Login to the San Francisco Compute')
    .action(async () => {
        const spinner = ora('Logging in...').start();

        const validation = generateValidationString()
        const result = await postSession({ 'host': "http://localhost:3000", validationString: validation })
        if (!result) {
            console.error('Failed to login')
            process.exit(1)
        }
        const { url, token } = result;
        exec(`open ${url}`); // if this fails, that's okay 

        process.stdout.write('\x1Bc');
        console.log(`\n\n  Click here to login:\n  ${url}\n\n`)
        console.log(`  Do these numbers match your browser window?\n  ${validation}\n\n`)


        const checkSession = async () => {
            const session = await getSession({ host: "http://localhost:3000", token: result.token });
            if (session?.token) {
                spinner.succeed('Logged in successfully');
                console.log(`Session token: ${session.token}`);

                await saveConfig({ token: session.token });
            } else {
                setTimeout(checkSession, 200);
            }
        };

        checkSession();
    });

program.parse(Bun.argv);
