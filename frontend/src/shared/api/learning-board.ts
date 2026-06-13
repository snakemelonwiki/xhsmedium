import { apiClient } from './apiClient';

export interface LearningBoardThresholds {
  minLeads: number;
  minTraffic: number;
}

export async function getLearningBoardThresholds(): Promise<LearningBoardThresholds> {
  const payload = await apiClient.get<Partial<LearningBoardThresholds>>('/posts/learning-board/thresholds');
  return {
    minLeads: Number(payload.minLeads ?? 10),
    minTraffic: Number(payload.minTraffic ?? 10000),
  };
}

export async function updateLearningBoardThresholds(
  thresholds: LearningBoardThresholds,
): Promise<LearningBoardThresholds> {
  const payload = await apiClient.put<Partial<LearningBoardThresholds>>(
    '/posts/learning-board/thresholds',
    {
      minLeads: thresholds.minLeads,
      minTraffic: thresholds.minTraffic,
    },
  );
  return {
    minLeads: Number(payload.minLeads ?? thresholds.minLeads),
    minTraffic: Number(payload.minTraffic ?? thresholds.minTraffic),
  };
}
