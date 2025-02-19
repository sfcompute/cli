import type { Contract } from "./types.ts";

const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const twoMonths = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

export const MOCK_CONTRACTS: Contract[] = [
  // 1. Upcoming contract with 1 order
  {
    object: "contract",
    status: "active",
    id: "upcoming-single",
    created_at: now.toISOString(),
    instance_type: "a100-80gb",
    shape: {
      intervals: [nextWeek.toISOString(), nextMonth.toISOString()],
      quantities: [2],
    },
    colocate_with: [],
  },

  // 2. Active contract with many orders
  {
    object: "contract",
    status: "active",
    id: "active-multi",
    created_at: lastWeek.toISOString(),
    instance_type: "a100-40gb",
    shape: {
      intervals: [
        lastWeek.toISOString(),
        yesterday.toISOString(),
        tomorrow.toISOString(),
        nextWeek.toISOString(),
      ],
      quantities: [1, 3, 2],
    },
    colocate_with: ["cluster-123"],
  },

  // 3. Upcoming contract with many orders
  {
    object: "contract",
    status: "active",
    id: "upcoming-multi",
    created_at: now.toISOString(),
    instance_type: "a100-80gb",
    shape: {
      intervals: [
        nextWeek.toISOString(),
        nextMonth.toISOString(),
        twoMonths.toISOString(),
      ],
      quantities: [1, 4],
    },
    colocate_with: [],
  },

  // 4. Expired contract (for testing expired state)
  {
    object: "contract",
    status: "active",
    id: "expired",
    created_at: lastWeek.toISOString(),
    instance_type: "a100-40gb",
    shape: {
      intervals: [lastWeek.toISOString(), yesterday.toISOString()],
      quantities: [2],
    },
    colocate_with: [],
  },

  // 5. Mixed state contract (some intervals expired, some active, some upcoming)
  {
    object: "contract",
    status: "active",
    id: "mixed-states",
    created_at: lastWeek.toISOString(),
    instance_type: "h100",
    shape: {
      intervals: [
        lastWeek.toISOString(),
        yesterday.toISOString(),
        tomorrow.toISOString(),
        nextWeek.toISOString(),
        nextMonth.toISOString(),
      ],
      quantities: [1, 2, 3, 4],
    },
    colocate_with: ["cluster-456"],
  },

  // 6. Contract with colocate_with
  {
    object: "contract",
    status: "active",
    id: "colocated",
    created_at: now.toISOString(),
    instance_type: "a100-80gb",
    shape: {
      intervals: [nextWeek.toISOString(), nextMonth.toISOString()],
      quantities: [2],
    },
    colocate_with: ["cluster-789", "cluster-012"],
  },
];
