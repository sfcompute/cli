export function generateValidationString() {
    const getRandomNumber = () => Math.floor(Math.random() * 100);
    return `${getRandomNumber()} ${getRandomNumber()} ${getRandomNumber()}`;
}

export async function postSession(props: {
    host: string,
    validationString: string;
}) {
    const response = await fetch(`${props.host}/cli/session`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            validation: props.validationString
        })
    });
    if (!response.ok) {
        console.error("Response not ok", response.status, response.statusText)
        return null
    }

    const body = await response.json() as {
        url: string,
        token: string
    };
    return body;
}

export async function getSession(props: {
    host: string,
    token: string
}) {

    const response = await fetch(`${props.host}/cli/session?token=${props.token}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });

    if (!response.ok) {
        return null;
    }

    const body = await response.json() as {
        validation?: string,
        token?: string
    };
    return body;
}