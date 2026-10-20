import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useWallet } from '@/contexts/wallet-context';
import { useCreateProposal } from '@/hooks/use-create-proposal';
import { useProposerEligibility } from '@/hooks/use-proposer-eligibility';
import {
  INITIAL_PROPOSAL_FORM_STATE,
  PROPOSAL_FORM_LIMITS,
  ProposalFormSchema,
  type ProposalFormState,
} from '@/types/proposal-form';

import { DashedDivider, SectionLabel, StatusTag, Touchable } from '../components/atoms';
import { HardShadow, Panel } from '../components/panel';
import { PixelBar } from '../components/pixel-bar';
import { PixelButton } from '../components/pixel-button';
import { ThermalBackground } from '../components/thermal-background';
import { NAV_BAR_HEIGHT, ThermalNavBar } from '../components/thermal-nav-bar';
import { StakeSheet } from '../components/stake-sheet';
import { formatCompact, tokenToNumber } from '../lib/format';
import { stepIn, stepOut } from '../motion';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';

type Stage = 0 | 1 | 2;

/**
 * NEW PROPOSAL as a three-stage wizard: Basics → Details → Review & submit.
 * Same form state, validation and on-chain submit as the legacy screen.
 * Figma: "Create Proposal B — 3 aşamalı sihirbaz".
 */
export function CreateProposalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isConnected, connect } = useWallet();
  const { submit, isSubmitting, status, error: submitError } = useCreateProposal();
  const { data: eligibility } = useProposerEligibility();
  const [isStakeOpen, setIsStakeOpen] = useState(false);
  const isBlocked = isConnected && eligibility !== undefined && !eligibility.isEligible;

  const [stage, setStage] = useState<Stage>(0);
  const [form, setForm] = useState<ProposalFormState>(INITIAL_PROPOSAL_FORM_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resourceInput, setResourceInput] = useState({ url: '', title: '' });
  const [showResourceInput, setShowResourceInput] = useState(false);

  function updateField<K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) clearError(field);
  }

  function clearError(...keys: Array<string>) {
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function handleCancel() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) router.back();
    else router.replace('/governance');
  }

  function goTo(next: Stage) {
    void Haptics.selectionAsync();
    setStage(next);
  }

  function handleNext() {
    if (stage === 0 && form.title.trim().length === 0) {
      setErrors((previous) => ({ ...previous, title: 'Title is required' }));
      return;
    }
    goTo((stage + 1) as Stage);
  }

  function addResource() {
    if (!resourceInput.url || !resourceInput.title) return;
    try {
      new URL(resourceInput.url);
    } catch {
      setErrors((previous) => ({ ...previous, resourceUrl: 'Invalid URL format' }));
      return;
    }
    if (form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES) {
      setErrors((previous) => ({ ...previous, resources: `Maximum ${PROPOSAL_FORM_LIMITS.MAX_RESOURCES} resources` }));
      return;
    }
    setForm((previous) => ({ ...previous, resources: [...previous.resources, { ...resourceInput }] }));
    setResourceInput({ url: '', title: '' });
    setShowResourceInput(false);
    clearError('resourceUrl', 'resources');
  }

  function removeResource(index: number) {
    setForm((previous) => ({ ...previous, resources: previous.resources.filter((_, i) => i !== index) }));
  }

  async function handleSubmit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = ProposalFormSchema.safeParse(form);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') next[path] = issue.message;
      }
      setErrors(next);
      // Jump back to the stage that owns the first failing field
      setStage(next.title || next.summary ? 0 : 1);
      return;
    }

    const submitResult = await submit({
      title: form.title,
      summary: form.summary || undefined,
      body: form.body || undefined,
      resources: form.resources.length > 0 ? form.resources : undefined,
    });

    if (submitResult.status === 'success' && submitResult.proposalId) {
      router.replace({ pathname: '/governance/[proposalId]', params: { proposalId: submitResult.proposalId } });
    }
  }

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const canSubmit = isConnected && form.title.trim().length > 0 && !isSubmitting;
  // The review stage adds a "1 transaction" line above the buttons
  const footerSpace = FOOTER_HEIGHT + insets.bottom + 24 + (stage === 2 ? FOOTER_NOTE_HEIGHT : 0);

  return (
    <View style={styles.root}>
      <ThermalBackground preset="rulebook" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + NAV_BAR_HEIGHT + 12, paddingBottom: footerSpace }]}
        >
          <View style={{ gap: 6 }}>
            <Text style={TYPE.display32}>NEW PROPOSAL</Text>
            <Text style={[TYPE.meta18, { color: INK.muted }]} numberOfLines={1}>
              {isBlocked || stage === 0
                ? 'Put an idea to a community vote.'
                : stage === 1
                  ? form.title
                  : 'Check everything before it goes on-chain.'}
            </Text>
          </View>

          {isBlocked && eligibility ? (
            <NotEligible
              userPower={eligibility.userPower}
              minRequired={eligibility.minRequired}
              onStake={() => setIsStakeOpen(true)}
              onRulebook={() => router.push('/rulebook')}
            />
          ) : (
            <>
              {stage === 0 && eligibility?.isEligible ? <EligibleCard userPower={eligibility.userPower} minRequired={eligibility.minRequired} /> : null}

              <Stepper stage={stage} onSelect={(index) => (index < stage ? goTo(index) : undefined)} />

              <Animated.View key={stage} entering={stepIn()} exiting={stepOut()} style={styles.stageBody}>
                {stage === 0 ? (
                  <BasicsStage form={form} errors={errors} onChange={updateField} />
                ) : stage === 1 ? (
                  <DetailsStage
                    form={form}
                    errors={errors}
                    onChange={updateField}
                    resourceInput={resourceInput}
                    showResourceInput={showResourceInput}
                    onResourceInput={(next) => {
                      setResourceInput(next);
                      if (errors.resourceUrl) clearError('resourceUrl');
                    }}
                    onToggleResourceInput={setShowResourceInput}
                    onAddResource={addResource}
                    onRemoveResource={removeResource}
                  />
                ) : (
                  <ReviewStage
                    form={form}
                    isConnected={isConnected}
                    onConnect={() => void connect()}
                    onEdit={(index) => goTo(index)}
                    submitError={submitError}
                    succeeded={status === 'success'}
                  />
                )}
              </Animated.View>
            </>
          )}
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <ThermalNavBar
        title="NEW PROPOSAL"
        icon="close"
        onBack={handleCancel}
        scrollY={scrollY}
      />

      {isBlocked ? null : (
        <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <FooterFade />
          {stage === 2 ? (
            <View style={[styles.between, { marginBottom: 12 }]}>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>1 transaction in your wallet</Text>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>GAS IN CHZ</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {stage === 0 ? (
              <PixelButton label="NEXT · DETAILS >" variant="gold" style={{ flex: 1 }} onPress={handleNext} />
            ) : stage === 1 ? (
              <>
                <PixelButton label="< BACK" variant="outline" style={{ alignSelf: 'auto' }} onPress={() => goTo(0)} />
                <PixelButton label="NEXT · REVIEW >" variant="gold" style={{ flex: 1 }} onPress={handleNext} />
              </>
            ) : (
              <>
                <PixelButton label="< BACK" variant="outline" style={{ alignSelf: 'auto' }} disabled={isSubmitting} onPress={() => goTo(1)} />
                <PixelButton
                  label={isSubmitting ? 'SUBMITTING…' : 'SUBMIT PROPOSAL >'}
                  variant="gold"
                  style={{ flex: 1 }}
                  disabled={!canSubmit}
                  onPress={() => void handleSubmit()}
                />
              </>
            )}
          </View>
        </View>
      )}

      <StakeSheet visible={isStakeOpen} onClose={() => setIsStakeOpen(false)} />
    </View>
  );
}

function Stepper({ stage, onSelect }: { stage: Stage; onSelect: (index: Stage) => void }) {
  return (
    <View style={[styles.row8, { alignItems: 'flex-start' }]}>
      {STAGES.map((label, index) => {
        const color = index === stage ? THERMAL_COLORS.gold : index < stage ? THERMAL_COLORS.cream : STEP_TODO;
        return (
          <Touchable key={label} onPress={() => onSelect(index as Stage)} containerStyle={{ flex: 1 }} style={{ gap: 8 }}>
            <View style={{ height: 6, backgroundColor: color }} />
            <Text style={[TYPE.label12, { color: index > stage ? INK.faint : color }]}>{`${index + 1} · ${label}`}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

function EligibleCard({ userPower, minRequired }: { userPower: bigint; minRequired: bigint }) {
  return (
    <Panel gap={8}>
      <View style={styles.between}>
        <View style={styles.row8}>
          <Image source={ICON_VAULT} style={{ width: 20, height: 20 }} contentFit="contain" />
          <Text style={TYPE.label12}>YOU CAN SUBMIT</Text>
        </View>
        <StatusTag label="ELIGIBLE" status="positive" />
      </View>
      <Text style={[TYPE.meta18, { color: INK.muted }]}>
        {`Proposals need ${formatPower(minRequired)} vePEPPER staked. You have ${formatPower(userPower)}.`}
      </Text>
    </Panel>
  );
}

interface NotEligibleProps {
  userPower: bigint;
  minRequired: bigint;
  onStake: () => void;
  onRulebook: () => void;
}

/** Shown instead of the form when the wallet holds too little vePEPPER */
function NotEligible({ userPower, minRequired, onStake, onRulebook }: NotEligibleProps) {
  const progress = minRequired > BigInt(0) ? Math.min(1, tokenToNumber(userPower, 18) / tokenToNumber(minRequired, 18)) : 0;
  const lit = Math.max(progress > 0 ? 1 : 0, Math.round(progress * NOT_ELIGIBLE_CELLS));

  return (
    <>
      <Panel>
        <View style={styles.row8}>
          <Image source={ICON_VAULT} style={{ width: 20, height: 20 }} contentFit="contain" />
          <Text style={TYPE.label12}>NOT ENOUGH vePEPPER YET</Text>
        </View>
        <Text style={TYPE.body14}>
          {`Submitting a proposal needs ${formatPower(minRequired)} vePEPPER staked. It keeps spam out of the vote.`}
        </Text>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>YOU HAVE</Text>
          <Text style={TYPE.meta18}>{`${formatPower(userPower)} / ${formatPower(minRequired)}`}</Text>
        </View>
        <PixelBar
          colors={Array.from({ length: NOT_ELIGIBLE_CELLS }, (_, cell) => (cell < lit ? THERMAL_COLORS.cream : THERMAL_COLORS.ghost))}
          height={8}
          delay={0}
        />
        <PixelButton label="STAKE PEPPER >" variant="gold" onPress={onStake} />
      </Panel>

      <View style={{ gap: 10 }}>
        <SectionLabel label="YOU CAN STILL" />
        <Panel padding={0} gap={0} onPress={onRulebook}>
          <View style={[styles.between, { padding: SPACE.panel }]}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Text style={TYPE.label12}>Read how proposals work</Text>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>Rulebook · Voting tracks</Text>
            </View>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
          </View>
        </Panel>
      </View>
    </>
  );
}

function formatPower(value: bigint): string {
  return formatCompact(tokenToNumber(value, 18));
}

interface StageProps {
  form: ProposalFormState;
  errors: Record<string, string>;
  onChange: <K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) => void;
}

function BasicsStage({ form, errors, onChange }: StageProps) {
  return (
    <>
      <Field label="TITLE" counter={`${form.title.length} / ${PROPOSAL_FORM_LIMITS.TITLE_MAX}`} error={errors.title}>
        <Input
          value={form.title}
          onChangeText={(text) => onChange('title', text)}
          placeholder="Give it a clear, short name"
          maxLength={PROPOSAL_FORM_LIMITS.TITLE_MAX}
          hasError={Boolean(errors.title)}
        />
      </Field>

      <Field
        label="SUMMARY · OPTIONAL"
        counter={`${form.summary.length} / ${PROPOSAL_FORM_LIMITS.SUMMARY_MAX}`}
        error={errors.summary}
      >
        <Input
          value={form.summary}
          onChangeText={(text) => onChange('summary', text)}
          placeholder="One line shown in the proposal list"
          maxLength={PROPOSAL_FORM_LIMITS.SUMMARY_MAX}
          multiline
          minHeight={88}
          hasError={Boolean(errors.summary)}
        />
      </Field>
    </>
  );
}

interface DetailsStageProps extends StageProps {
  resourceInput: { url: string; title: string };
  showResourceInput: boolean;
  onResourceInput: (next: { url: string; title: string }) => void;
  onToggleResourceInput: (show: boolean) => void;
  onAddResource: () => void;
  onRemoveResource: (index: number) => void;
}

function DetailsStage({
  form,
  errors,
  onChange,
  resourceInput,
  showResourceInput,
  onResourceInput,
  onToggleResourceInput,
  onAddResource,
  onRemoveResource,
}: DetailsStageProps) {
  const resourcesFull = form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES;

  return (
    <>
      <Field
        label="DESCRIPTION · OPTIONAL"
        counter={`${form.body.length} / ${formatCount(PROPOSAL_FORM_LIMITS.BODY_MAX)}`}
        helper="Plain text. Paste links as full URLs."
        error={errors.body}
      >
        <Input
          value={form.body}
          onChangeText={(text) => onChange('body', text)}
          placeholder="What should happen, and why?"
          maxLength={PROPOSAL_FORM_LIMITS.BODY_MAX}
          multiline
          minHeight={120}
          hasError={Boolean(errors.body)}
        />
      </Field>

      <Field
        label="LINKS · OPTIONAL"
        counter={`${form.resources.length} / ${PROPOSAL_FORM_LIMITS.MAX_RESOURCES}`}
        error={errors.resources}
      >
        {form.resources.map((resource, index) => (
          <Panel key={`${resource.url}-${index}`} padding={12} gap={2}>
            <View style={styles.between}>
              <Text style={[TYPE.label12, { flex: 1 }]} numberOfLines={1}>
                {resource.title}
              </Text>
              <Touchable onPress={() => onRemoveResource(index)} hitSlop={10}>
                <Text style={[TYPE.label12, { color: INK.muted }]}>REMOVE</Text>
              </Touchable>
            </View>
            <Text style={TYPE.meta18} numberOfLines={1}>
              {resource.url}
            </Text>
          </Panel>
        ))}

        {showResourceInput ? (
          <Panel padding={12}>
            <Input
              value={resourceInput.title}
              onChangeText={(text) => onResourceInput({ ...resourceInput, title: text })}
              placeholder="Link title, e.g. Forum discussion"
            />
            <Input
              value={resourceInput.url}
              onChangeText={(text) => onResourceInput({ ...resourceInput, url: text })}
              placeholder="https://…"
              autoCapitalize="none"
              keyboardType="url"
              hasError={Boolean(errors.resourceUrl)}
            />
            {errors.resourceUrl ? <Text style={styles.error}>{errors.resourceUrl}</Text> : null}
            <View style={styles.actions}>
              <PixelButton
                label="CANCEL"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  onToggleResourceInput(false);
                  onResourceInput({ url: '', title: '' });
                }}
              />
              <PixelButton label="ADD" variant="gold" style={{ flex: 1 }} onPress={onAddResource} />
            </View>
          </Panel>
        ) : (
          <PixelButton label="+ ADD LINK" variant="outline" disabled={resourcesFull} onPress={() => onToggleResourceInput(true)} />
        )}
      </Field>
    </>
  );
}

interface ReviewStageProps {
  form: ProposalFormState;
  isConnected: boolean;
  onConnect: () => void;
  onEdit: (stage: Stage) => void;
  submitError: string | null;
  succeeded: boolean;
}

function ReviewStage({ form, isConnected, onConnect, onEdit, submitError, succeeded }: ReviewStageProps) {
  const rows: Array<{ label: string; value: string; stage: Stage }> = [
    { label: 'TITLE', value: form.title, stage: 0 },
    { label: 'SUMMARY', value: form.summary, stage: 0 },
    { label: 'DESCRIPTION', value: form.body ? `${form.body.length} characters` : '', stage: 1 },
    { label: 'LINKS', value: form.resources.map((resource) => resource.title).join(' · '), stage: 1 },
  ];

  return (
    <>
      {!isConnected ? (
        <Panel borderColor={STATUS_COLORS.negative.stroke}>
          <StatusTag label="WALLET NOT CONNECTED" status="negative" />
          <Text style={TYPE.body14}>Connect your wallet to submit proposals.</Text>
          <PixelButton label="CONNECT WALLET >" variant="outlineGold" onPress={onConnect} />
        </Panel>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionLabel label="HOW IT WILL LOOK IN DECIDE" />
        <Panel gap={6}>
          <View style={styles.between}>
            <StatusTag label="PENDING" status="upcoming" />
            <Text style={[TYPE.meta18, { color: INK.muted }]}>NEEDS MINISTERS</Text>
          </View>
          <Text style={[TYPE.label12, { color: INK_KIND }]}>COMMUNITY VOTE · NEW</Text>
          <Text style={TYPE.display24} numberOfLines={2}>
            {form.title || 'Your proposal title'}
          </Text>
        </Panel>
      </View>

      <View>
        <HardShadow />
        <View style={styles.reviewList}>
          {rows.map((row, index) => (
            <View key={row.label}>
              {index > 0 ? <DashedDivider /> : null}
              <View style={styles.reviewRow}>
                <View style={styles.between}>
                  <Text style={[TYPE.label12, { color: INK.muted }]}>{row.label}</Text>
                  <Touchable onPress={() => onEdit(row.stage)} hitSlop={8}>
                    <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>EDIT</Text>
                  </Touchable>
                </View>
                <Text style={[TYPE.meta18, !row.value && styles.dim]} numberOfLines={2}>
                  {row.value || '—'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Panel gap={10}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>WHAT HAPPENS NEXT</Text>
        {NEXT_STEPS.map((step, index) => (
          <View key={step.title} style={[styles.row8, { alignItems: 'flex-start', gap: 10 }]}>
            <View style={styles.stepBox}>
              <Text style={[TYPE.label12, { color: INK.muted }]}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={TYPE.meta18}>{step.title}</Text>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>{step.hint}</Text>
            </View>
          </View>
        ))}
      </Panel>

      {submitError ? (
        <Panel borderColor={STATUS_COLORS.negative.stroke}>
          <StatusTag label="NOT SUBMITTED" status="negative" />
          <Text style={TYPE.body14}>{submitError}</Text>
        </Panel>
      ) : null}

      {succeeded ? (
        <Panel borderColor={STATUS_COLORS.positive.stroke}>
          <StatusTag label="SUBMITTED" status="positive" />
          <Text style={TYPE.body14}>Your proposal is on-chain. Ministers review it next.</Text>
        </Panel>
      ) : null}
    </>
  );
}

interface FieldProps {
  label: string;
  counter?: string;
  helper?: string;
  error?: string;
  children: ReactNode;
}

function Field({ label, counter, helper, error, children }: FieldProps) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.between}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
        {counter ? <Text style={[TYPE.meta18, { color: INK.muted }]}>{counter}</Text> : null}
      </View>
      {children}
      {helper ? <Text style={[TYPE.meta18, { color: INK.muted }]}>{helper}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

interface InputProps extends TextInputProps {
  minHeight?: number;
  hasError?: boolean;
}

function Input({ minHeight, hasError, style, ...rest }: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = hasError ? STATUS_COLORS.negative.stroke : isFocused || Boolean(rest.value) ? THERMAL_COLORS.gold : THERMAL_COLORS.border;

  return (
    <TextInput
      placeholderTextColor={INK.faint}
      textAlignVertical="top"
      selectionColor={THERMAL_COLORS.gold}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...rest}
      style={[TYPE.body14, styles.input, { borderColor, color: THERMAL_COLORS.white }, minHeight ? { minHeight } : null, style]}
    />
  );
}

/**
 * Footer backdrop: a fixed-height fade strip above a solid void block. The
 * solid part stretches with the footer (it grows on the review step), so no
 * background shows through under the buttons when the content is scrolled.
 */
function FooterFade() {
  const { width } = useWindowDimensions();
  // Wrapped so react-native-svg never intercepts taps meant for the buttons
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={FOOTER_FADE}>
        <Defs>
          <LinearGradient id="create-footer" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={FOOTER_FADE} fill="url(#create-footer)" />
      </Svg>
      <View style={styles.footerSolid} />
    </View>
  );
}

/** "10000" → "10,000" for counters */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

const STAGES = ['BASICS', 'DETAILS', 'REVIEW'] as const;
const NOT_ELIGIBLE_CELLS = 20;
/** Upcoming stepper segments (Figma: 25% white) */
const STEP_TODO = 'rgba(255,255,255,0.25)';
/** Kind label sits a step dimmer than other labels (Figma: 50%) */
const INK_KIND = 'rgba(255,255,255,0.5)';
const ICON_VAULT = require('@/assets/images/pepper/vault.png');

const NEXT_STEPS = [
  { title: 'Ministers review', hint: '2 of 3 must approve' },
  { title: 'Community vote', hint: 'Runs on its voting track · needs 50% YES' },
  { title: 'Execution', hint: 'Actions run on-chain' },
];
const FOOTER_HEIGHT = 74;
const FOOTER_NOTE_HEIGHT = 32;
/** Fade strip at the top of the footer (= its top padding) */
const FOOTER_FADE = 24;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THERMAL_COLORS.void,
  },
  content: {
    paddingHorizontal: SPACE.margin,
    gap: SPACE.section,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row8: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  row6: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageBody: {
    gap: SPACE.section,
  },
  input: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dim: {
    color: 'rgba(255,255,255,0.35)',
  },
  error: {
    ...TYPE.label12,
    color: STATUS_COLORS.negative.text,
  },
  reviewList: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  reviewRow: {
    gap: 4,
    paddingHorizontal: SPACE.rowX,
    paddingVertical: SPACE.rowY,
  },
  stepBox: {
    width: 20,
    height: 20,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: FOOTER_FADE,
    paddingHorizontal: SPACE.margin,
  },
  footerSolid: {
    position: 'absolute',
    top: FOOTER_FADE,
    left: 0,
    right: 0,
    // Run past the bottom edge so an overscroll bounce never shows a gap
    bottom: -FOOTER_FADE * 4,
    backgroundColor: THERMAL_COLORS.void,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
});
