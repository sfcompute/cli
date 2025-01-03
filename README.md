# cli

This is the San Francisco Compute command line tool.

### Install (MacOS/Linux)

Install the command line tool by running:

```bash
curl -fsSL https://sfcompute.com/cli/install | bash
```

Then, you can run the cli:

```bash
sf --version  # 0.1.0
```

## Local Development / Contributing

### Setup

- Install [Deno](https://docs.deno.com/runtime/)
- Install dependencies `deno install`
  - Use same mental model as `npm install`
- Auth your CLI with `deno run prod login`

### Development Loop

- Make code changes
- Test changes with
  - `deno run devv` to test against local API
  - `deno run prod` to test against production API
  - The `deno run <env>` is an alias to the user facing `sf` command. So if you wanted to run `sf login` locally against the local API, run `deno run devv login`
