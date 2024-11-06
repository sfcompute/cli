export interface Contract {
  object: string;
  status: string;
  id: string;
  created_at: string;
  instance_type: string;
  shape: {
    // These are date strings
    intervals: string[];
    quantities: number[];
  };
  colocate_with: string[];
  cluster_id?: string;
}
