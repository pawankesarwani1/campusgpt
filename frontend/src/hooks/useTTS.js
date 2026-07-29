import { useState, useEffect, useCallback } from 'react';

// Global state to track which message is speaking across all components
let globalSpeakingId = null;
const listeners = new Set();

const setGlobalSpeakingId = (id) => {
  globalSpeakingId = id;
  listeners.forEach(listener => listener(id));
};

export default function useTTS() {
  const [speakingId, setSpeakingId] = useState(globalSpeakingId);

  useEffect(() => {
    const listener = (id) => setSpeakingId(id);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setGlobalSpeakingId(null);
    }
  }, []);

  const speak = useCallback((text, id) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // If clicking the same message that is currently speaking, stop it
    if (globalSpeakingId === id) {
      stopSpeaking();
      return;
    }

    // Stop anything currently speaking
    stopSpeaking();

    // Clean up text (remove markdown like **, *, #, `)
    const cleanText = text
      .replace(/[*#`_~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links but keep text
      .replace(/<[^>]*>?/gm, ''); // remove html tags

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Attempt to use a natural Indian English voice if available
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(v => v.lang === 'en-IN');
    if (indianVoice) {
      utterance.voice = indianVoice;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 1.0; // normal speed
    
    utterance.onend = () => {
      if (globalSpeakingId === id) setGlobalSpeakingId(null);
    };
    
    utterance.onerror = () => {
      if (globalSpeakingId === id) setGlobalSpeakingId(null);
    };

    setGlobalSpeakingId(id);
    
    // Slight delay to ensure cancel() finishes
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  }, [stopSpeaking]);

  return { speak, stopSpeaking, speakingId };
}
