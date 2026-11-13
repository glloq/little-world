/** Audio consumes the presentation controller's level; it never measures/changes global quality. */
export interface AudioBudget {maxTotalVoices:number;maxMusicVoices:number;maxSpatial:number;maxPcmBytes:number;ambienceLayers:number;}
export function audioBudgetForLevel(level:number):AudioBudget {return level>=2?{maxTotalVoices:12,maxMusicVoices:6,maxSpatial:2,maxPcmBytes:2_097_152,ambienceLayers:1}:level===1?{maxTotalVoices:16,maxMusicVoices:8,maxSpatial:3,maxPcmBytes:4_194_304,ambienceLayers:2}:{maxTotalVoices:24,maxMusicVoices:12,maxSpatial:4,maxPcmBytes:4_194_304,ambienceLayers:2};}
