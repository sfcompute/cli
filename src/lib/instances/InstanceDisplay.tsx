import { Box, Text } from "ink";
import type { InstanceObject } from "./types.ts";
import Spinner from "ink-spinner";
import { Row } from "../Row.tsx";
import React from 'react';

export function InstanceDisplay(props: { instance: InstanceObject }) {
  let status = "loading";
  if (props.instance.status === "running" && props.instance.can_connect) {
    status = "ready";
  }

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        {status === "loading" && (
          <Text color={"yellow"}>
            <Spinner type="dots" />
          </Text>
        )}
        {status === "ready" && <Text color={"green"}>✓</Text>}
        <Text color={"green"}>{props.instance.id}</Text>
        <Text dimColor>({props.instance.status})</Text>
      </Box>

      <Row headWidth={10} head="type" value={props.instance.type} />
      <Row headWidth={10} head="ip" value={props.instance.public_ip} />
      <Row headWidth={10} head="status" value={props.instance.status} />
      <Row
        headWidth={10}
        head="ssh"
        value={props.instance.can_connect ? "ready" : "not ready"}
      />
      <Row
        headWidth={10}
        head="ssh port"
        value={props.instance.ssh_port?.toString() ?? "-"}
      />
      <Row
        headWidth={10}
        head="ssh cmd"
        value={`sf ssh ${props.instance.id}`}
      />
    </Box>
  );
}

export function InstanceList(props: { instances: InstanceObject[] }) {
  if (props.instances.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>
          No instances found, you either haven't bought any, or they haven't
          started yet.
        </Text>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor>
            # List contracts you've bought to see when instances will start
          </Text>
          <Text color="yellow">sf contracts list</Text>
        </Box>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># If you don't have a contract, you can buy one</Text>
          <Text color="yellow">sf buy</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {props.instances.map((instance) => (
        <InstanceDisplay key={instance.id} instance={instance} />
      ))}
    </Box>
  );
}
