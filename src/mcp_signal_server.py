"""
Signal Management MCP Server
----------------------------

This module implements a lightweight server for managing inbound and outbound
signals using well‑understood decision frameworks.  The server is built with
FastAPI and exposes multiple endpoints (tools) that can be called
independently.  Each tool encapsulates a single mechanism for either filtering
out unwanted signals or prioritising worthwhile ones.

Design goals
============

* **Composability** – Each endpoint focuses on a small, orthogonal task so that
  higher‑level workflows can be assembled by chaining calls together.
* **Transparency** – Scoring and filtering algorithms are implemented in plain
  Python.  Inputs and outputs are fully specified via Pydantic models.
* **Extendibility** – New tools can be added easily by defining a new
  Pydantic schema and a corresponding route function.

Endpoints
---------

The following tools are provided out of the box:

* ``/filter_by_source`` – Remove any signals whose ``source`` field is not
  contained in an allowed list.  This is a simple whitelist gate useful for
  excluding noisy or untrusted sources.

* ``/filter_by_regex`` – Keep only signals whose ``content`` matches a
  user‑supplied regular expression.  This can be used to focus on topics of
  interest while discarding unrelated noise.

* ``/score_signals`` – Compute an Expected Value of Attention (EVA) score for
  each signal based on estimated probability of usefulness, impact and time
  cost.  Signals with a higher EVA are expected to yield more value per unit
  of attention spent on them.  See the EVA formula defined in the
  implementation for details.

* ``/prioritize_signals`` – Sort a batch of signals from highest to lowest
  EVA score and optionally return only the top‑``k`` items.

* ``/random_sample`` – Sample a fixed number of signals uniformly at random
  from the input collection.  This is intended to create a “noise reservoir”
  for auditing the false‑negative rate of the filters.

To run the server locally, install the dependencies (e.g. ``pip install
fastapi uvicorn``) and execute this module with ``uvicorn
mcp_signal_server:app --reload``.  In production you would deploy the app
behind a reverse proxy and configure authentication according to your needs.
"""

from __future__ import annotations

import re
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pydantic import field_validator, model_validator


app = FastAPI(
    title="Signal Management MCP",
    description=(
        "A microservice exposing tools for filtering and prioritising signals "
        "using decision frameworks such as source whitelisting, regular "
        "expression matching, and expected value of attention (EVA) scoring."
    ),
    version="1.0.0",
)


class Signal(BaseModel):
    """Represents a single signal in the management system.

    Attributes
    ----------
    id: str
        A unique identifier for the signal (e.g. a UUID or database key).
    content: str
        The raw textual content of the signal.  This might include an email
        body, a commit message, or any other free‑form text.
    source: str
        The origin of the signal.  Examples include an email address,
        repository name, Slack channel, or alerting system.
    category: Optional[str]
        An optional high‑level categorisation, such as "bug", "feature",
        "marketing", etc.  Categories can be used downstream for more
        sophisticated filtering strategies.
    time_cost: float
        An estimate of how many minutes of attention this signal would
        consume if processed.  Defaults to 1 minute.
    probability_useful: float
        A subjective estimate of the probability (between 0 and 1) that this
        signal will contain useful or actionable information.  Defaults to 0.5.
    impact: float
        A relative measure (0 < impact ≤ 10) of how significant the
        information in this signal might be if it is indeed useful.  Higher
        values denote larger potential impact.  Defaults to 1.0.
    """

    id: str
    content: str
    source: str
    category: Optional[str] = None
    time_cost: float = Field(default=1.0, ge=0.0)
    probability_useful: float = Field(default=0.5, ge=0.0, le=1.0)
    impact: float = Field(default=1.0, gt=0.0, le=10.0)

    @field_validator("time_cost")
    @classmethod
    def validate_time_cost(cls, value: float) -> float:
        # Avoid division by zero in EVA calculation
        return max(value, 1e-6)


class FilterBySourceRequest(BaseModel):
    signals: List[Signal]
    allowed_sources: List[str] = Field(
        default_factory=list,
        description="List of source identifiers to keep. Any signal with a source not "
        "in this list will be removed.",
    )


class FilterBySourceResponse(BaseModel):
    signals: List[Signal]


class FilterByRegexRequest(BaseModel):
    signals: List[Signal]
    pattern: str = Field(
        ..., description="A Python regular expression used to match signal content."
    )
    flags: Optional[int] = Field(
        default=0,
        description="Optional bitmask of re module flags (e.g., re.IGNORECASE).",
    )


class FilterByRegexResponse(BaseModel):
    signals: List[Signal]


class ScoreSignalsRequest(BaseModel):
    signals: List[Signal]


class SignalScore(BaseModel):
    id: str
    score: float


class ScoreSignalsResponse(BaseModel):
    scores: List[SignalScore]


class PrioritizeSignalsRequest(BaseModel):
    signals: List[Signal]
    top_k: Optional[int] = Field(
        default=None,
        description=(
            "If provided, only the top_k signals with the highest EVA scores will be returned."
        ),
    )


class PrioritizeSignalsResponse(BaseModel):
    signals: List[Signal]


class RandomSampleRequest(BaseModel):
    signals: List[Signal]
    sample_size: int = Field(
        ..., description="Number of signals to sample uniformly at random."
    )

    @model_validator(mode="after")
    def validate_sample_size(self) -> "RandomSampleRequest":
        if self.sample_size < 0:
            raise ValueError("sample_size must be non‑negative")
        if self.signals and self.sample_size > len(self.signals):
            raise ValueError(
                "sample_size cannot exceed the number of provided signals"
            )
        return self


class RandomSampleResponse(BaseModel):
    signals: List[Signal]


def calculate_eva(signal: Signal) -> float:
    """Compute the Expected Value of Attention (EVA) for a given signal.

    EVA is defined as:

        EVA = (probability_useful × impact) / (time_cost)

    where ``probability_useful`` is the estimated probability that the signal
    contains useful information, ``impact`` is a relative measure of how
    significant the information could be, and ``time_cost`` is the estimated
    amount of time (in minutes) required to process the signal.  Larger EVA
    values indicate higher expected return per unit of attention.

    Parameters
    ----------
    signal: Signal
        The signal for which to compute the EVA.

    Returns
    -------
    float
        The computed EVA score.
    """
    # To avoid division by zero we clamp time_cost in the validator
    return (signal.probability_useful * signal.impact) / signal.time_cost


@app.post("/filter_by_source", response_model=FilterBySourceResponse)
async def filter_by_source(req: FilterBySourceRequest) -> FilterBySourceResponse:
    """Filter signals based on their source identifier.

    Only signals whose ``source`` attribute is contained in the ``allowed_sources``
    list will be retained.  If ``allowed_sources`` is empty, the original list
    of signals is returned unmodified.

    Examples
    --------
    >>> curl -X POST http://localhost:8000/filter_by_source -H "Content-Type: application/json" -d '{"signals": [...], "allowed_sources": ["github", "email"]}'
    """
    if not req.allowed_sources:
        return FilterBySourceResponse(signals=req.signals)

    allowed_set = set(req.allowed_sources)
    filtered = [s for s in req.signals if s.source in allowed_set]
    return FilterBySourceResponse(signals=filtered)


@app.post("/filter_by_regex", response_model=FilterByRegexResponse)
async def filter_by_regex(req: FilterByRegexRequest) -> FilterByRegexResponse:
    """Filter signals whose content matches a given regular expression.

    Signals whose ``content`` field matches the provided regular expression
    (configured via ``pattern`` and optional ``flags``) are retained; all
    others are discarded.  Invalid regular expressions will result in a
    ``400 Bad Request`` response.
    """
    try:
        compiled = re.compile(req.pattern, flags=req.flags or 0)
    except re.error as exc:
        raise HTTPException(status_code=400, detail=f"Invalid regular expression: {exc}")

    filtered = [s for s in req.signals if compiled.search(s.content) is not None]
    return FilterByRegexResponse(signals=filtered)


@app.post("/score_signals", response_model=ScoreSignalsResponse)
async def score_signals(req: ScoreSignalsRequest) -> ScoreSignalsResponse:
    """Compute EVA scores for a batch of signals.

    Returns a list of (id, score) pairs sorted from highest to lowest score.
    """
    scores = [SignalScore(id=s.id, score=calculate_eva(s)) for s in req.signals]
    # Sort descending by score
    scores.sort(key=lambda x: x.score, reverse=True)
    return ScoreSignalsResponse(scores=scores)


@app.post("/prioritize_signals", response_model=PrioritizeSignalsResponse)
async def prioritize_signals(req: PrioritizeSignalsRequest) -> PrioritizeSignalsResponse:
    """Prioritize a list of signals based on their EVA score.

    This endpoint computes the EVA score for each signal, sorts the signals
    descending by score, and optionally truncates the list to the top ``k``
    entries if ``top_k`` is provided.
    """
    # Compute EVA for each signal and pair with the signal
    scored_pairs = [(s, calculate_eva(s)) for s in req.signals]
    scored_pairs.sort(key=lambda pair: pair[1], reverse=True)
    prioritized = [pair[0] for pair in scored_pairs]
    if req.top_k is not None:
        prioritized = prioritized[: max(req.top_k, 0)]
    return PrioritizeSignalsResponse(signals=prioritized)


@app.post("/random_sample", response_model=RandomSampleResponse)
async def random_sample(req: RandomSampleRequest) -> RandomSampleResponse:
    """Return a random subset of the provided signals.

    The ``sample_size`` parameter determines how many signals are returned.  If
    ``sample_size`` is zero, an empty list is returned.  If it equals the
    number of input signals, all signals are returned in a random order.
    """
    import random

    if req.sample_size == 0 or not req.signals:
        return RandomSampleResponse(signals=[])
    # random.sample returns a new list and does not mutate the original
    sampled = random.sample(req.signals, req.sample_size)
    return RandomSampleResponse(signals=sampled)