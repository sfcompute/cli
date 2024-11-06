export interface ListResponseBody<T> {
  data: T[];
  object: "list";
}

export type InstanceType = "h100i" | "h100" | "a100";

export interface InstanceObject {
  object: "instance";
  id: string;
  type: InstanceType;
  public_ip: string;
  private_ip: string;
  status: string;
  ssh_port: number | undefined;
  can_connect?: boolean;
}
