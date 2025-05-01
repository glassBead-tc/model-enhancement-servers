#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';

// Types
interface Option {
  id: string;
  name: string;
  description: string;
}

interface Outcome {
  id: string;
  description: string;
  probability: number; // 0.0-1.0
  optionId: string;
  value: number; // Utility value, can be positive or negative
  confidenceInEstimate: number; // 0.0-1.0
}

interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 0.0-1.0, with all weights summing to 1.0
  evaluationMethod: "quantitative" | "qualitative" | "boolean";
}

interface CriterionEvaluation {
  criterionId: string;
  optionId: string;
  score: number; // 0.0-1.0 for normalized scores
  justification: string;
}

interface InformationGap {
  description: string;
  impact: number; // 0.0-1.0, how much it affects the decision
  researchMethod: string;
}

interface DecisionAnalysisData {
  // Core decision elements
  decisionStatement: string;
  options: Option[];
  criteria?: Criterion[];
  criteriaEvaluations?: CriterionEvaluation[];
  possibleOutcomes?: Outcome[];
  informationGaps?: InformationGap[];
  
  // Decision context
  stakeholders: string[];
  constraints: string[];
  timeHorizon: string;
  riskTolerance: "risk-averse" | "risk-neutral" | "risk-seeking";
  
  // Analysis results
  expectedValues?: Record<string, number>; // optionId -> expected value
  multiCriteriaScores?: Record<string, number>; // optionId -> weighted score
  sensitivityInsights?: string[];
  recommendation?: string;
  
  // Process metadata
  decisionId: string;
  analysisType: "expected-utility" | "multi-criteria" | "maximin" | "minimax-regret" | "satisficing";
  stage: "problem-definition" | "options" | "criteria" | "evaluation" | "analysis" | "recommendation";
  iteration: number;
  
  // Next steps
  nextStageNeeded: boolean;
  suggestedNextStage?: string;
}

class DecisionFrameworkServer {
  private decisionHistory: Record<string, DecisionAnalysisData[]> = {};
  private optionRegistry: Record<string, Record<string, Option>> = {};
  private criteriaRegistry: Record<string, Record<string, Criterion>> = {};
  private nextElementId = 1;

  private validateDecisionAnalysisData(input: unknown): DecisionAnalysisData {
    const data = input as Record<string, unknown>;
    
    // Validate required fields
    if (!data.decisionStatement || typeof data.decisionStatement !== 'string') {
      throw new Error('Invalid decisionStatement: must be a string');
    }
    
    if (!data.decisionId || typeof data.decisionId !== 'string') {
      throw new Error('Invalid decisionId: must be a string');
    }
    
    if (!data.analysisType || typeof data.analysisType !== 'string') {
      throw new Error('Invalid analysisType: must be a string');
    }
    
    if (!data.stage || typeof data.stage !== 'string') {
      throw new Error('Invalid stage: must be a string');
    }
    
    if (!data.riskTolerance || typeof data.riskTolerance !== 'string') {
      throw new Error('Invalid riskTolerance: must be a string');
    }
    
    if (!data.timeHorizon || typeof data.timeHorizon !== 'string') {
      throw new Error('Invalid timeHorizon: must be a string');
    }
    
    if (typeof data.iteration !== 'number' || data.iteration < 0) {
      throw new Error('Invalid iteration: must be a non-negative number');
    }
    
    if (typeof data.nextStageNeeded !== 'boolean') {
      throw new Error('Invalid nextStageNeeded: must be a boolean');
    }
    
    // Validate arrays
    if (!Array.isArray(data.options)) {
      throw new Error('Invalid options: must be an array');
    }
    
    if (!Array.isArray(data.stakeholders)) {
      throw new Error('Invalid stakeholders: must be an array');
    }
    
    if (!Array.isArray(data.constraints)) {
      throw new Error('Invalid constraints: must be an array');
    }
    
    // Process options
    const options: Option[] = [];
    for (const option of data.options as Array<Record<string, unknown>>) {
      if (!option.id || typeof option.id !== 'string') {
        option.id = `option-${this.nextElementId++}`;
      }
      
      if (!option.name || typeof option.name !== 'string') {
        throw new Error(`Invalid option name for option ${option.id}: must be a string`);
      }
      
      if (!option.description || typeof option.description !== 'string') {
        throw new Error(`Invalid option description for option ${option.id}: must be a string`);
      }
      
      options.push({
        id: option.id as string,
        name: option.name as string,
        description: option.description as string
      });
    }
    
    // Process criteria
    const criteria: Criterion[] = [];
    if (Array.isArray(data.criteria)) {
      for (const criterion of data.criteria as Array<Record<string, unknown>>) {
        if (!criterion.id || typeof criterion.id !== 'string') {
          criterion.id = `criterion-${this.nextElementId++}`;
        }
        
        if (!criterion.name || typeof criterion.name !== 'string') {
          throw new Error(`Invalid criterion name for criterion ${criterion.id}: must be a string`);
        }
        
        if (!criterion.description || typeof criterion.description !== 'string') {
          throw new Error(`Invalid criterion description for criterion ${criterion.id}: must be a string`);
        }
        
        if (typeof criterion.weight !== 'number' || criterion.weight < 0 || criterion.weight > 1) {
          throw new Error(`Invalid criterion weight for criterion ${criterion.id}: must be a number between 0 and 1`);
        }
        
        if (!criterion.evaluationMethod || typeof criterion.evaluationMethod !== 'string') {
          throw new Error(`Invalid criterion evaluationMethod for criterion ${criterion.id}: must be a string`);
        }
        
        criteria.push({
          id: criterion.id as string,
          name: criterion.name as string,
          description: criterion.description as string,
          weight: criterion.weight as number,
          evaluationMethod: criterion.evaluationMethod as Criterion['evaluationMethod']
        });
      }
    }
    
    // Process criteria evaluations
    const criteriaEvaluations: CriterionEvaluation[] = [];
    if (Array.isArray(data.criteriaEvaluations)) {
      for (const evaluation of data.criteriaEvaluations as Array<Record<string, unknown>>) {
        if (!evaluation.criterionId || typeof evaluation.criterionId !== 'string') {
          throw new Error('Invalid criterionId in evaluation: must be a string');
        }
        
        if (!evaluation.optionId || typeof evaluation.optionId !== 'string') {
          throw new Error('Invalid optionId in evaluation: must be a string');
        }
        
        if (typeof evaluation.score !== 'number' || evaluation.score < 0 || evaluation.score > 1) {
          throw new Error('Invalid score in evaluation: must be a number between 0 and 1');
        }
        
        if (!evaluation.justification || typeof evaluation.justification !== 'string') {
          throw new Error('Invalid justification in evaluation: must be a string');
        }
        
        criteriaEvaluations.push({
          criterionId: evaluation.criterionId as string,
          optionId: evaluation.optionId as string,
          score: evaluation.score as number,
          justification: evaluation.justification as string
        });
      }
    }
    
    // Process outcomes
    const possibleOutcomes: Outcome[] = [];
    if (Array.isArray(data.possibleOutcomes)) {
      for (const outcome of data.possibleOutcomes as Array<Record<string, unknown>>) {
        if (!outcome.id || typeof outcome.id !== 'string') {
          outcome.id = `outcome-${this.nextElementId++}`;
        }
        
        if (!outcome.description || typeof outcome.description !== 'string') {
          throw new Error(`Invalid outcome description for outcome ${outcome.id}: must be a string`);
        }
        
        if (!outcome.optionId || typeof outcome.optionId !== 'string') {
          throw new Error(`Invalid optionId for outcome ${outcome.id}: must be a string`);
        }
        
        if (typeof outcome.probability !== 'number' || outcome.probability < 0 || outcome.probability > 1) {
          throw new Error(`Invalid probability for outcome ${outcome.id}: must be a number between 0 and 1`);
        }
        
        if (typeof outcome.value !== 'number') {
          throw new Error(`Invalid value for outcome ${outcome.id}: must be a number`);
        }
        
        if (typeof outcome.confidenceInEstimate !== 'number' || outcome.confidenceInEstimate < 0 || outcome.confidenceInEstimate > 1) {
          throw new Error(`Invalid confidenceInEstimate for outcome ${outcome.id}: must be a number between 0 and 1`);
        }
        
        possibleOutcomes.push({
          id: outcome.id as string,
          description: outcome.description as string,
          optionId: outcome.optionId as string,
          probability: outcome.probability as number,
          value: outcome.value as number,
          confidenceInEstimate: outcome.confidenceInEstimate as number
        });
      }
    }
    
    // Process information gaps
    const informationGaps: InformationGap[] = [];
    if (Array.isArray(data.informationGaps)) {
      for (const gap of data.informationGaps as Array<Record<string, unknown>>) {
        if (!gap.description || typeof gap.description !== 'string') {
          throw new Error('Invalid information gap description: must be a string');
        }
        
        if (typeof gap.impact !== 'number' || gap.impact < 0 || gap.impact > 1) {
          throw new Error('Invalid information gap impact: must be a number between 0 and 1');
        }
        
        if (!gap.researchMethod || typeof gap.researchMethod !== 'string') {
          throw new Error('Invalid information gap researchMethod: must be a string');
        }
        
        informationGaps.push({
          description: gap.description as string,
          impact: gap.impact as number,
          researchMethod: gap.researchMethod as string
        });
      }
    }
    
    // Process expected values
    const expectedValues: Record<string, number> = {};
    if (data.expectedValues && typeof data.expectedValues === 'object') {
      for (const [optionId, value] of Object.entries(data.expectedValues)) {
        if (typeof value === 'number') {
          expectedValues[optionId] = value;
        }
      }
    }
    
    // Process multi-criteria scores
    const multiCriteriaScores: Record<string, number> = {};
    if (data.multiCriteriaScores && typeof data.multiCriteriaScores === 'object') {
      for (const [optionId, score] of Object.entries(data.multiCriteriaScores)) {
        if (typeof score === 'number') {
          multiCriteriaScores[optionId] = score;
        }
      }
    }
    
    // Process sensitivity insights
    const sensitivityInsights: string[] = [];
    if (Array.isArray(data.sensitivityInsights)) {
      for (const insight of data.sensitivityInsights) {
        if (typeof insight === 'string') {
          sensitivityInsights.push(insight);
        }
      }
    }
    
    // Process stakeholders and constraints
    const stakeholders: string[] = [];
    for (const stakeholder of data.stakeholders) {
      if (typeof stakeholder === 'string') {
        stakeholders.push(stakeholder);
      }
    }
    
    const constraints: string[] = [];
    for (const constraint of data.constraints) {
      if (typeof constraint === 'string') {
        constraints.push(constraint);
      }
    }
    
    // Create validated data object
    return {
      decisionStatement: data.decisionStatement as string,
      options,
      stakeholders,
      constraints,
      timeHorizon: data.timeHorizon as string,
      riskTolerance: data.riskTolerance as DecisionAnalysisData['riskTolerance'],
      decisionId: data.decisionId as string,
      analysisType: data.analysisType as DecisionAnalysisData['analysisType'],
      stage: data.stage as DecisionAnalysisData['stage'],
      iteration: data.iteration as number,
      nextStageNeeded: data.nextStageNeeded as boolean,
      suggestedNextStage: typeof data.suggestedNextStage === 'string' ? data.suggestedNextStage : undefined,
      criteria: criteria.length > 0 ? criteria : undefined,
      criteriaEvaluations: criteriaEvaluations.length > 0 ? criteriaEvaluations : undefined,
      possibleOutcomes: possibleOutcomes.length > 0 ? possibleOutcomes : undefined,
      informationGaps: informationGaps.length > 0 ? informationGaps : undefined,
      expectedValues: Object.keys(expectedValues).length > 0 ? expectedValues : undefined,
      multiCriteriaScores: Object.keys(multiCriteriaScores).length > 0 ? multiCriteriaScores : undefined,
      sensitivityInsights: sensitivityInsights.length > 0 ? sensitivityInsights : undefined,
      recommendation: typeof data.recommendation === 'string' ? data.recommendation : undefined
    };
  }

  private updateRegistries(data: DecisionAnalysisData): void {
    // Initialize registries if needed
    if (!this.optionRegistry[data.decisionId]) {
      this.optionRegistry[data.decisionId] = {};
    }
    
    if (!this.criteriaRegistry[data.decisionId]) {
      this.criteriaRegistry[data.decisionId] = {};
    }
    
    // Update option registry
    for (const option of data.options) {
      this.optionRegistry[data.decisionId][option.id] = option;
    }
    
    // Update criteria registry
    if (data.criteria) {
      for (const criterion of data.criteria) {
        this.criteriaRegistry[data.decisionId][criterion.id] = criterion;
      }
    }
  }

  private updateDecisionAnalysis(data: DecisionAnalysisData): void {
    // Initialize decision history if needed
    if (!this.decisionHistory[data.decisionId]) {
      this.decisionHistory[data.decisionId] = [];
    }
    
    // Add to decision history
    this.decisionHistory[data.decisionId].push(data);
    
    // Update registries
    this.updateRegistries(data);
    
    // Calculate expected values if needed
    if (data.analysisType === 'expected-utility' && data.possibleOutcomes && data.possibleOutcomes.length > 0) {
      this.calculateExpectedValues(data);
    }
    
    // Calculate multi-criteria scores if needed
    if (data.analysisType === 'multi-criteria' && data.criteria && data.criteriaEvaluations && data.criteriaEvaluations.length > 0) {
      this.calculateMultiCriteriaScores(data);
    }
  }

  private calculateExpectedValues(data: DecisionAnalysisData): void {
    if (!data.possibleOutcomes) return;
    
    const expectedValues: Record<string, number> = {};
    const optionOutcomes: Record<string, Outcome[]> = {};
    
    // Group outcomes by option
    for (const outcome of data.possibleOutcomes) {
      if (!optionOutcomes[outcome.optionId]) {
        optionOutcomes[outcome.optionId] = [];
      }
      optionOutcomes[outcome.optionId].push(outcome);
    }
    
    // Calculate expected value for each option
    for (const [optionId, outcomes] of Object.entries(optionOutcomes)) {
      let expectedValue = 0;
      let totalProbability = 0;
      
      for (const outcome of outcomes) {
        expectedValue += outcome.probability * outcome.value;
        totalProbability += outcome.probability;
      }
      
      // Normalize if probabilities don't sum to 1
      if (totalProbability > 0 && totalProbability !== 1) {
        expectedValue = expectedValue / totalProbability;
      }
      
      expectedValues[optionId] = expectedValue;
    }
    
    data.expectedValues = expectedValues;
  }

  private calculateMultiCriteriaScores(data: DecisionAnalysisData): void {
    if (!data.criteria || !data.criteriaEvaluations) return;
    
    const multiCriteriaScores: Record<string, number> = {};
    const optionEvaluations: Record<string, CriterionEvaluation[]> = {};
    
    // Group evaluations by option
    for (const evaluation of data.criteriaEvaluations) {
      if (!optionEvaluations[evaluation.optionId]) {
        optionEvaluations[evaluation.optionId] = [];
      }
      optionEvaluations[evaluation.optionId].push(evaluation);
    }
    
    // Calculate weighted score for each option
    for (const [optionId, evaluations] of Object.entries(optionEvaluations)) {
      let weightedScore = 0;
      let totalWeight = 0;
      
      for (const evaluation of evaluations) {
        const criterion = data.criteria.find(c => c.id === evaluation.criterionId);
        if (criterion) {
          weightedScore += evaluation.score * criterion.weight;
          totalWeight += criterion.weight;
        }
      }
      
      // Normalize if weights don't sum to 1
      if (totalWeight > 0 && totalWeight !== 1) {
        weightedScore = weightedScore / totalWeight;
      }
      
      multiCriteriaScores[optionId] = weightedScore;
    }
    
    data.multiCriteriaScores = multiCriteriaScores;
  }

  private visualizeDecisionAnalysis(data: DecisionAnalysisData): string {
    let output = `\n${chalk.bold(`DECISION ANALYSIS: ${data.decisionStatement}`)} (ID: ${data.decisionId})\n\n`;
    
    // Analysis type and stage
    output += `${chalk.cyan('Analysis Type:')} ${data.analysisType}\n`;
    output += `${chalk.cyan('Stage:')} ${data.stage}\n`;
    output += `${chalk.cyan('Iteration:')} ${data.iteration}\n`;
    output += `${chalk.cyan('Risk Tolerance:')} ${data.riskTolerance}\n`;
    output += `${chalk.cyan('Time Horizon:')} ${data.timeHorizon}\n\n`;
    
    // Context
    output += `${chalk.bold('CONTEXT:')}\n`;
    output += `${chalk.yellow('Stakeholders:')}\n`;
    for (const stakeholder of data.stakeholders) {
      output += `  - ${stakeholder}\n`;
    }
    output += '\n';
    
    output += `${chalk.yellow('Constraints:')}\n`;
    for (const constraint of data.constraints) {
      output += `  - ${constraint}\n`;
    }
    output += '\n';
    
    // Options
    output += `${chalk.bold('OPTIONS:')}\n`;
    for (const option of data.options) {
      let optionHeader = `  [${option.id}] ${chalk.bold(option.name)}`;
      
      // Add scores if available
      if (data.expectedValues && data.expectedValues[option.id] !== undefined) {
        optionHeader += ` ${chalk.green(`(EV: ${data.expectedValues[option.id].toFixed(2)})`)}`;
      }
      
      if (data.multiCriteriaScores && data.multiCriteriaScores[option.id] !== undefined) {
        optionHeader += ` ${chalk.blue(`(Score: ${(data.multiCriteriaScores[option.id] * 100).toFixed(0)}%)`)}`;
      }
      
      output += `${optionHeader}\n`;
      output += `     ${option.description}\n\n`;
    }
    
    // Criteria
    if (data.criteria && data.criteria.length > 0) {
      output += `${chalk.bold('CRITERIA:')}\n`;
      for (const criterion of data.criteria) {
        output += `  [${criterion.id}] ${chalk.bold(criterion.name)} (Weight: ${(criterion.weight * 100).toFixed(0)}%)\n`;
        output += `     ${criterion.description}\n`;
        output += `     Evaluation method: ${criterion.evaluationMethod}\n\n`;
      }
    }
    
    // Criteria Evaluations
    if (data.criteriaEvaluations && data.criteriaEvaluations.length > 0) {
      output += `${chalk.bold('EVALUATIONS:')}\n`;
      
      // Group evaluations by option
      const optionEvaluations: Record<string, CriterionEvaluation[]> = {};
      for (const evaluation of data.criteriaEvaluations) {
        if (!optionEvaluations[evaluation.optionId]) {
          optionEvaluations[evaluation.optionId] = [];
        }
        optionEvaluations[evaluation.optionId].push(evaluation);
      }
      
      for (const [optionId, evaluations] of Object.entries(optionEvaluations)) {
        const option = data.options.find(o => o.id === optionId);
        if (!option) continue;
        
        output += `  ${chalk.bold(option.name)}:\n`;
        
        for (const evaluation of evaluations) {
          const criterion = data.criteria?.find(c => c.id === evaluation.criterionId);
          if (!criterion) continue;
          
          const scoreDisplay = (evaluation.score * 100).toFixed(0);
          output += `     ${criterion.name}: ${scoreDisplay}% - ${evaluation.justification}\n`;
        }
        output += '\n';
      }
    }
    
    // Outcomes
    if (data.possibleOutcomes && data.possibleOutcomes.length > 0) {
      output += `${chalk.bold('POSSIBLE OUTCOMES:')}\n`;
      
      // Group outcomes by option
      const optionOutcomes: Record<string, Outcome[]> = {};
      for (const outcome of data.possibleOutcomes) {
        if (!optionOutcomes[outcome.optionId]) {
          optionOutcomes[outcome.optionId] = [];
        }
        optionOutcomes[outcome.optionId].push(outcome);
      }
      
      for (const [optionId, outcomes] of Object.entries(optionOutcomes)) {
        const option = data.options.find(o => o.id === optionId);
        if (!option) continue;
        
        output += `  ${chalk.bold(option.name)}:\n`;
        
        for (const outcome of outcomes) {
          const probabilityDisplay = (outcome.probability * 100).toFixed(0);
          const valueDisplay = outcome.value >= 0 ? `+${outcome.value.toFixed(1)}` : outcome.value.toFixed(1);
          const confidenceDisplay = (outcome.confidenceInEstimate * 100).toFixed(0);
          
          output += `     ${probabilityDisplay}% chance: ${outcome.description}\n`;
          output += `       Value: ${valueDisplay}, Confidence: ${confidenceDisplay}%\n`;
        }
        output += '\n';
      }
    }
    
    // Information Gaps
    if (data.informationGaps && data.informationGaps.length > 0) {
      output += `${chalk.bold('INFORMATION GAPS:')}\n`;
      for (const gap of data.informationGaps) {
        const impactDisplay = (gap.impact * 100).toFixed(0);
        output += `  - ${gap.description} (Impact: ${impactDisplay}%)\n`;
        output += `    Research method: ${gap.researchMethod}\n\n`;
      }
    }
    
    // Sensitivity Insights
    if (data.sensitivityInsights && data.sensitivityInsights.length > 0) {
      output += `${chalk.bold('SENSITIVITY INSIGHTS:')}\n`;
      for (const insight of data.sensitivityInsights) {
        output += `  - ${insight}\n`;
      }
      output += '\n';
    }
    
    // Recommendation
    if (data.recommendation) {
      output += `${chalk.bold('RECOMMENDATION:')}\n`;
      output += `  ${data.recommendation}\n\n`;
    }
    
    // Next steps
    if (data.nextStageNeeded) {
      output += `${chalk.blue('SUGGESTED NEXT STAGE:')}\n`;
      if (data.suggestedNextStage) {
        output += `  � Move to ${data.suggestedNextStage} stage\n`;
      } else {
        output += `  � Continue with the current stage\n`;
      }
    }
    
    return output;
  }

  public processDecisionAnalysis(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateDecisionAnalysisData(input);
      
      // Update decision state
      this.updateDecisionAnalysis(validatedInput);
      
      // Generate visualization
      const visualization = this.visualizeDecisionAnalysis(validatedInput);
      console.error(visualization);
      
      // Return the analysis result
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            decisionId: validatedInput.decisionId,
            decisionStatement: validatedInput.decisionStatement,
            analysisType: validatedInput.analysisType,
            stage: validatedInput.stage,
            iteration: validatedInput.iteration,
            optionCount: validatedInput.options.length,
            criteriaCount: validatedInput.criteria?.length || 0,
            outcomesCount: validatedInput.possibleOutcomes?.length || 0,
            nextStageNeeded: validatedInput.nextStageNeeded,
            suggestedNextStage: validatedInput.suggestedNextStage
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

const DECISION_FRAMEWORK_TOOL: Tool = {
  name: "decisionFramework",
  description: `A detailed tool for structured decision analysis and rational choice.
This tool helps models systematically evaluate options, criteria, and outcomes.
It supports multiple decision frameworks, probability estimates, and value judgments.

When to use this tool:
- Complex decisions with multiple options
- Decisions requiring systematic evaluation of trade-offs
- Decisions under uncertainty with probability estimates
- Multi-stakeholder decisions with different criteria
- Risk analysis and management

Key features:
- Structured option evaluation
- Multi-criteria decision analysis
- Expected utility calculations
- Information value analysis
- Visual decision support`,

  inputSchema: {
    type: "object",
    properties: {
      decisionStatement: {
        type: "string",
        description: "Clear statement of the decision to be made"
      },
      options: {
        type: "array",
        description: "Available options or alternatives",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier for the option"
            },
            name: {
              type: "string",
              description: "Name of the option"
            },
            description: {
              type: "string",
              description: "Description of the option"
            }
          },
          required: ["name", "description"]
        }
      },
      criteria: {
        type: "array",
        description: "Criteria for evaluating options",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier for the criterion"
            },
            name: {
              type: "string",
              description: "Name of the criterion"
            },
            description: {
              type: "string",
              description: "Description of the criterion"
            },
            weight: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Weight of the criterion (0.0-1.0)"
            },
            evaluationMethod: {
              type: "string",
              enum: ["quantitative", "qualitative", "boolean"],
              description: "Method for evaluating options against this criterion"
            }
          },
          required: ["name", "description", "weight", "evaluationMethod"]
        }
      },
      criteriaEvaluations: {
        type: "array",
        description: "Evaluations of options against criteria",
        items: {
          type: "object",
          properties: {
            criterionId: {
              type: "string",
              description: "ID of the criterion"
            },
            optionId: {
              type: "string",
              description: "ID of the option"
            },
            score: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Score of the option on this criterion (0.0-1.0)"
            },
            justification: {
              type: "string",
              description: "Justification for the score"
            }
          },
          required: ["criterionId", "optionId", "score", "justification"]
        }
      },
      possibleOutcomes: {
        type: "array",
        description: "Possible outcomes and their probabilities",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier for the outcome"
            },
            description: {
              type: "string",
              description: "Description of the outcome"
            },
            probability: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Probability of the outcome (0.0-1.0)"
            },
            optionId: {
              type: "string",
              description: "ID of the option this outcome is associated with"
            },
            value: {
              type: "number",
              description: "Utility value of the outcome (can be positive or negative)"
            },
            confidenceInEstimate: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Confidence in the probability and value estimates (0.0-1.0)"
            }
          },
          required: ["description", "probability", "optionId", "value", "confidenceInEstimate"]
        }
      },
      informationGaps: {
        type: "array",
        description: "Gaps in information that affect the decision",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Description of the information gap"
            },
            impact: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Impact of the information gap on the decision (0.0-1.0)"
            },
            researchMethod: {
              type: "string",
              description: "Method for filling the information gap"
            }
          },
          required: ["description", "impact", "researchMethod"]
        }
      },
      stakeholders: {
        type: "array",
        description: "People or groups affected by the decision",
        items: {
          type: "string"
        }
      },
      constraints: {
        type: "array",
        description: "Constraints on the decision",
        items: {
          type: "string"
        }
      },
      timeHorizon: {
        type: "string",
        description: "Time frame for the decision"
      },
      riskTolerance: {
        type: "string",
        enum: ["risk-averse", "risk-neutral", "risk-seeking"],
        description: "Risk tolerance for the decision"
      },
      expectedValues: {
        type: "object",
        description: "Expected values for each option",
        additionalProperties: {
          type: "number"
        }
      },
      multiCriteriaScores: {
        type: "object",
        description: "Multi-criteria scores for each option",
        additionalProperties: {
          type: "number"
        }
      },
      sensitivityInsights: {
        type: "array",
        description: "Insights from sensitivity analysis",
        items: {
          type: "string"
        }
      },
      recommendation: {
        type: "string",
        description: "Recommendation based on the analysis"
      },
      decisionId: {
        type: "string",
        description: "Unique identifier for this decision"
      },
      analysisType: {
        type: "string",
        enum: ["expected-utility", "multi-criteria", "maximin", "minimax-regret", "satisficing"],
        description: "Type of decision analysis"
      },
      stage: {
        type: "string",
        enum: ["problem-definition", "options", "criteria", "evaluation", "analysis", "recommendation"],
        description: "Current stage of the decision process"
      },
      iteration: {
        type: "number",
        minimum: 0,
        description: "Current iteration of the decision analysis"
      },
      nextStageNeeded: {
        type: "boolean",
        description: "Whether another stage is needed"
      },
      suggestedNextStage: {
        type: "string",
        description: "Suggested next stage of the decision process"
      }
    },
    required: ["decisionStatement", "options", "stakeholders", "constraints", "timeHorizon", "riskTolerance", "decisionId", "analysisType", "stage", "iteration", "nextStageNeeded"]
  }
};

const server = new Server(
  {
    name: "decision-framework-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const decisionFrameworkServer = new DecisionFrameworkServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [DECISION_FRAMEWORK_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "decisionFramework") {
    return decisionFrameworkServer.processDecisionAnalysis(request.params.arguments);
  }

  return {
    content: [{
      type: "text",
      text: `Unknown tool: ${request.params.name}`
    }],
    isError: true
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Decision Framework MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});