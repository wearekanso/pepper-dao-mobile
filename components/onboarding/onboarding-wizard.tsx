import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { telemetry } from '@/lib/telemetry';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface SlideData {
  title: string;
  emoji: string;
  description: string;
  color: string;
}

const SLIDES: SlideData[] = [
  {
    title: 'Feel the Pulse',
    emoji: '🎮',
    description: 'Track PEPPER metrics, treasury health, and community stats. Stay updated on the DAO\'s heartbeat!',
    color: '#00FF80',
  },
  {
    title: 'Decide Together',
    emoji: '🗳️',
    description: 'Vote on governance proposals and shape the DAO\'s future. Your voice matters in every decision.',
    color: '#FF006E',
  },
  {
    title: 'Claim Your Power',
    emoji: '🏆',
    description: 'Vote, propose, and earn reputation to climb 6 ranks. Build streaks to unlock rewards and influence!',
    color: '#0080FF',
  },
];

/**
 * Slide Component
 * Individual slide in the onboarding wizard
 */
function Slide({ data }: { data: SlideData }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      {/* Emoji Icon Box */}
      <View 
        className="mb-8 border-4 border-black p-8 shadow-[8px_8px_0px_#000000]"
        style={{ backgroundColor: data.color }}
      >
        <Text className="text-6xl text-center">{data.emoji}</Text>
      </View>

      {/* Title */}
      <Text className="mb-6 text-center font-['PPNeueBit-Bold'] text-3xl uppercase tracking-wider text-black">
        {data.title}
      </Text>

      {/* Description */}
      <Text className="text-center font-['PPMondwest-Regular'] text-base leading-7 text-gray-800">
        {data.description}
      </Text>
    </View>
  );
}

/**
 * OnboardingWizard Component
 * 3-slide wizard for first-time users with Skip option
 */
export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isFirstSlide = currentIndex === 0;
  const isLastSlide = currentIndex === SLIDES.length - 1;

  // Track onboarding start on mount
  useEffect(() => {
    telemetry.track('onboarding_started');
  }, []);

  // Track step viewed whenever index changes
  useEffect(() => {
    telemetry.track('onboarding_step_viewed', { 
      step: currentIndex + 1,
      stepTitle: SLIDES[currentIndex].title,
    });
  }, [currentIndex]);

  function handleNext() {
    if (isLastSlide) {
      // Complete onboarding
      onComplete();
    } else {
      // Go to next slide
      setCurrentIndex((prev) => Math.min(prev + 1, SLIDES.length - 1));
    }
  }

  function handleBack() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  function handleSkip() {
    telemetry.track('onboarding_skipped', { 
      skippedAtStep: currentIndex + 1,
    });
    onSkip();
  }

  return (
    <View className="flex-1 bg-white">
      {/* Skip Button - Top Right */}
      <View className="absolute right-6 top-12 z-10">
        <Pressable
          onPress={handleSkip}
          className="border-3 border-gray-400 bg-transparent px-4 py-2 active:bg-gray-100"
        >
          <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-gray-600">
            Skip
          </Text>
        </Pressable>
      </View>

      {/* Slide Content */}
      <View className="flex-1 pt-24">
        <Slide data={SLIDES[currentIndex]} />
      </View>

      {/* Bottom Navigation Section */}
      <View className="px-6 pb-12">
        {/* Pagination Dots */}
        <View className="mb-8 flex-row items-center justify-center gap-3">
          {SLIDES.map((_, index) => (
            <View
              key={index}
              className={`h-3 w-3 border-2 border-black ${
                index === currentIndex ? 'bg-black' : 'bg-transparent'
              }`}
            />
          ))}
        </View>

        {/* Navigation Buttons */}
        <View className="flex-row gap-4">
          {/* Back Button (only show if not first slide) */}
          {!isFirstSlide && (
            <Button
              onPress={handleBack}
              variant="secondary"
              className="flex-2"
            >
              ← Back
            </Button>
          )}

          {/* Next/Get Started Button */}
          <Button
            onPress={handleNext}
            variant="primary"
            className="flex-1"
          >
            {isLastSlide ? '✓ Get Started' : 'Next →'}
          </Button>
        </View>
      </View>
    </View>
  );
}

