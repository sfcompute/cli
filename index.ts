import { Command } from 'commander';
import ora from 'ora';
import { exec } from 'node:child_process';

const program = new Command();

program
    .name('sfc')
    .description('San Francisco Compute command line tool')
    .version('1.0.0');

async function postSession(props: {
    host: string
}) {
    function generateValidationString() {
        const getRandomNumber = () => Math.floor(Math.random() * 100);
        return `${getRandomNumber()} ${getRandomNumber()} ${getRandomNumber()}`;
    }

    const validationString = generateValidationString();

    const response = await fetch(`${props.host}/cli/session`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            validation: validationString
        })
    });
    if (!response.ok) {
        console.error("Response not ok", response.status, response.statusText)
        console.error(await response.text())
        return null
    }

    const body = await response.json() as {
        url: string
    };
    return body;
}

program
    .command('login')
    .description('Login to the San Francisco Compute')
    .action(async () => {
        const spinner = ora('Logging in...').start();

        const result = await postSession({ 'host': "http://localhost:3000" })
        if (!result) {
            console.error('Failed to login')
            process.exit(1)
        }
        const { url } = result;
        exec(`open ${url}`, (err) => {
            if (err) {
                // console.error('Failed to open URL:', err);
            }
        });

        console.log(`Open ${url}`)

        // Simulate login process
        setTimeout(() => {
            spinner.succeed('Logged in successfully');
        }, 2000);
    });

program.parse(Bun.argv);
