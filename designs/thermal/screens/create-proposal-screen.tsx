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
import {
  INITIAL_PROPOSAL_FORM_STATE,
  PROPOSAL_FORM_LIMITS,
  ProposalFormSchema,
  type ProposalFormState,
} from '@/types/proposal-form';

import { Tag, Touchable } from '../components/atoms';
import { Panel } from '../components/panel';
import { PixelBar } from '../components/pixel-bar';
import { PixelButton } from '../components/pixel-button';
import { ThermalBackground } from '../components/thermal-background';
import { NAV_BAR_HEIGHT, ThermalNavBar } from '../components/thermal-nav-bar';
import { stepIn, stepOut } from '../motion';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';

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
  const footerSpace = FOOTER_HEIGHT + insets.bottom + 24;

  return (
    <View style={styles.root}>
      <ThermalBackground preset="rulebook" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.content, { paddingTop: TOP_SPACE + NAV_BAR_HEIGHT + 12, paddingBottom: footerSpace }]}
        >
          <View style={{ gap: 2 }}>
            <Text style={TYPE.display40}>NEW PROPOSAL</Text>
            <Text style={[TYPE.meta18, { color: 'rgba(255,255,255,0.6)' }]}>Basics · Details · Review & submit</Text>
          </View>

          <View style={styles.stages}>
            {STAGES.map((label, index) => {
              const color = index === stage ? THERMAL_COLORS.gold : index < stage ? THERMAL_COLORS.cream : 'rgba(255,255,255,0.35)';
              return (
                <Touchable key={label} onPress={() => (index < stage ? goTo(index as Stage) : undefined)} style={styles.stage}>
                  <View style={{ width: 8, height: 8, backgroundColor: color }} />
                  <Text style={[TYPE.label10, { color }]}>{`STAGE ${index + 1} · ${label}`}</Text>
                </Touchable>
              );
            })}
          </View>
          <PixelBar colors={progressColors(stage)} height={6} gap={3} delay={0} />

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
                submitError={submitError}
                succeeded={status === 'success'}
              />
            )}
          </Animated.View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <ThermalNavBar
        title="NEW PROPOSAL"
        icon="close"
        onBack={handleCancel}
        accessory={`STAGE ${stage + 1} / ${STAGES.length}`}
        scrollY={scrollY}
        topInset={TOP_SPACE}
      />

      <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <FooterFade />
        <View style={styles.actions}>
          {stage === 0 ? (
            <>
              <PixelButton label="CANCEL" variant="outline" style={{ alignSelf: 'auto' }} onPress={handleCancel} />
              <PixelButton label="NEXT · DETAILS >" variant="gold" style={{ flex: 1 }} onPress={handleNext} />
            </>
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
    </View>
  );
}

interface StageProps {
  form: ProposalFormState;
  errors: Record<string, string>;
  onChange: <K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) => void;
}

function BasicsStage({ form, errors, onChange }: StageProps) {
  return (
    <>
      <Field label="TITLE *" counter={`${form.title.length} / ${PROPOSAL_FORM_LIMITS.TITLE_MAX}`} error={errors.title}>
        <Input
          value={form.title}
          onChangeText={(text) => onChange('title', text)}
          placeholder="Enter proposal title"
          maxLength={PROPOSAL_FORM_LIMITS.TITLE_MAX}
          hasError={Boolean(errors.title)}
        />
      </Field>

      <Field
        label="SUMMARY"
        optional
        counter={`${form.summary.length} / ${PROPOSAL_FORM_LIMITS.SUMMARY_MAX}`}
        helper="Brief description shown in the proposal list."
        error={errors.summary}
      >
        <Input
          value={form.summary}
          onChangeText={(text) => onChange('summary', text)}
          placeholder="One line shown in the proposal list"
          maxLength={PROPOSAL_FORM_LIMITS.SUMMARY_MAX}
          multiline
          minHeight={72}
          hasError={Boolean(errors.summary)}
        />
      </Field>

      <View style={styles.between}>
        <Text style={[TYPE.label10, { opacity: 0.6 }]}>PREVIEW · HOW IT WILL APPEAR</Text>
        <Text style={[TYPE.meta16, { color: THERMAL_COLORS.gold }]}>DRAFT</Text>
      </View>
      <Panel borderColor={THERMAL_COLORS.orange}>
        <View style={styles.row8}>
          <Tag label="DRAFT" />
          <Tag label="PEP · NEW" variant="outline" color={THERMAL_COLORS.border} />
        </View>
        <Text style={[TYPE.meta26, !form.title && styles.dim]} numberOfLines={2}>
          {form.title || 'Your proposal title'}
        </Text>
        <Text style={[TYPE.body14, !form.summary && styles.dim]} numberOfLines={2}>
          {form.summary || 'One line shown in the proposal list'}
        </Text>
      </Panel>
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
        label="BODY"
        optional
        counter={`${form.body.length} / ${PROPOSAL_FORM_LIMITS.BODY_MAX}`}
        helper="Full proposal details. Supports markdown: **bold**, *italic*, [links](url), - lists"
        error={errors.body}
      >
        <Input
          value={form.body}
          onChangeText={(text) => onChange('body', text)}
          placeholder="Detailed description of your proposal…"
          maxLength={PROPOSAL_FORM_LIMITS.BODY_MAX}
          multiline
          minHeight={160}
          hasError={Boolean(errors.body)}
        />
      </Field>

      <Field
        label="RESOURCES"
        optional
        counter={`${form.resources.length} / ${PROPOSAL_FORM_LIMITS.MAX_RESOURCES}`}
        helper="Add links to discussions, documentation, or other resources."
        error={errors.resources}
      >
        {form.resources.map((resource, index) => (
          <Panel key={`${resource.url}-${index}`} padding={12} gap={2}>
            <View style={styles.between}>
              <Text style={[TYPE.label12, { flex: 1 }]} numberOfLines={1}>
                {resource.title}
              </Text>
              <Touchable onPress={() => onRemoveResource(index)} hitSlop={10}>
                <Text style={[TYPE.label12, { color: THERMAL_COLORS.red }]}>X</Text>
              </Touchable>
            </View>
            <Text style={[TYPE.meta16, { opacity: 0.6 }]} numberOfLines={1}>
              {resource.url}
            </Text>
          </Panel>
        ))}

        {showResourceInput ? (
          <Panel padding={12}>
            <Input
              value={resourceInput.title}
              onChangeText={(text) => onResourceInput({ ...resourceInput, title: text })}
              placeholder="Resource title"
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
                paddingVertical={10}
                style={{ flex: 1 }}
                onPress={() => {
                  onToggleResourceInput(false);
                  onResourceInput({ url: '', title: '' });
                }}
              />
              <PixelButton label="ADD" variant="gold" paddingVertical={10} style={{ flex: 1 }} onPress={onAddResource} />
            </View>
          </Panel>
        ) : (
          <PixelButton
            label={`+ ADD RESOURCE`}
            variant="outline"
            disabled={resourcesFull}
            onPress={() => onToggleResourceInput(true)}
          />
        )}
      </Field>
    </>
  );
}

interface ReviewStageProps {
  form: ProposalFormState;
  isConnected: boolean;
  onConnect: () => void;
  submitError: string | null;
  succeeded: boolean;
}

function ReviewStage({ form, isConnected, onConnect, submitError, succeeded }: ReviewStageProps) {
  return (
    <>
      {!isConnected ? (
        <Panel borderColor={THERMAL_COLORS.red}>
          <View style={styles.row6}>
            <View style={{ width: 8, height: 8, backgroundColor: THERMAL_COLORS.red }} />
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.red }]}>WALLET NOT CONNECTED</Text>
          </View>
          <Text style={TYPE.body14}>Please connect your wallet to submit proposals.</Text>
          <PixelButton label="CONNECT WALLET >" variant="outlineGold" paddingVertical={12} onPress={onConnect} />
        </Panel>
      ) : null}

      <Panel>
        <ReviewRow label="TITLE" value={form.title} />
        <ReviewRow label="SUMMARY" value={form.summary} />
        <ReviewRow label="BODY" value={form.body ? `${form.body.length} characters · markdown` : ''} />
        <ReviewRow
          label="RESOURCES"
          value={form.resources.length > 0 ? form.resources.map((r) => r.title).join(' · ') : ''}
        />
      </Panel>

      {submitError ? (
        <Panel borderColor={THERMAL_COLORS.red}>
          <Text style={[TYPE.label10, { color: THERMAL_COLORS.red }]}>SUBMISSION FAILED</Text>
          <Text style={TYPE.body14}>{submitError}</Text>
        </Panel>
      ) : null}

      {succeeded ? (
        <Panel borderColor={THERMAL_COLORS.gold}>
          <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>PROPOSAL SUBMITTED</Text>
          <Text style={TYPE.body14}>Your proposal has been submitted to the blockchain.</Text>
        </Panel>
      ) : null}

      <Text style={[TYPE.body13, { textAlign: 'center' }]}>
        Submitting a proposal requires a transaction on Chiliz blockchain. Gas fees will be paid in CHZ.
      </Text>
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={[TYPE.label10, { opacity: 0.6 }]}>{label}</Text>
      <Text style={[TYPE.body14, !value && styles.dim]} numberOfLines={3}>
        {value || '—'}
      </Text>
    </View>
  );
}

interface FieldProps {
  label: string;
  optional?: boolean;
  counter?: string;
  helper?: string;
  error?: string;
  children: ReactNode;
}

function Field({ label, optional, counter, helper, error, children }: FieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.between}>
        <View style={styles.row8}>
          <Text style={TYPE.label12}>{label}</Text>
          {optional ? <Tag label="OPTIONAL" variant="outline" color={THERMAL_COLORS.border} /> : null}
        </View>
        {counter ? <Text style={[TYPE.meta16, { opacity: 0.6 }]}>{counter}</Text> : null}
      </View>
      {helper ? <Text style={TYPE.body13}>{helper}</Text> : null}
      {children}
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
  const borderColor = hasError ? THERMAL_COLORS.red : isFocused ? THERMAL_COLORS.gold : THERMAL_COLORS.border;

  return (
    <TextInput
      placeholderTextColor="rgba(255,255,255,0.35)"
      textAlignVertical="top"
      selectionColor={THERMAL_COLORS.gold}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...rest}
      style={[TYPE.body14, styles.input, { borderColor, color: THERMAL_COLORS.white }, minHeight ? { minHeight } : null, style]}
    />
  );
}

function FooterFade() {
  const { width } = useWindowDimensions();
  // Wrapped so react-native-svg never intercepts taps meant for the buttons
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height="100%">
        <Defs>
          <LinearGradient id="create-footer" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="0.35" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height="100%" fill="url(#create-footer)" />
      </Svg>
    </View>
  );
}

function progressColors(stage: Stage): Array<string> {
  const lit = (stage + 1) * CELLS_PER_STAGE;
  return Array.from({ length: STAGES.length * CELLS_PER_STAGE }, (_, cell) =>
    cell < lit ? THERMAL_COLORS.gold : THERMAL_COLORS.ghost,
  );
}

const STAGES = ['BASICS', 'DETAILS', 'REVIEW'] as const;
/** The route is presented as a modal card (see app/_layout.tsx), so the status bar is not above us */
const TOP_SPACE = 8;
const CELLS_PER_STAGE = 4;
const FOOTER_HEIGHT = 74;

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
  stages: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageBody: {
    gap: SPACE.section,
  },
  input: {
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dim: {
    color: 'rgba(255,255,255,0.35)',
  },
  error: {
    ...TYPE.label10,
    color: THERMAL_COLORS.red,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 24,
    paddingHorizontal: SPACE.margin,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
});
