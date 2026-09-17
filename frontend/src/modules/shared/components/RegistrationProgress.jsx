import React from 'react';
import { motion } from 'framer-motion';

const RegistrationProgress = ({ currentStep, totalSteps = 5 }) => {
    const steps = [
        { label: 'Personal' },
        { label: 'Vehicle' },
        { label: 'Documents' },
        { label: 'Bank' }
    ];

    const progress = (currentStep / totalSteps) * 100;

    return (
        <div className="w-full mb-3 select-none">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-taxi-primary uppercase tracking-[0.15em]">Step {currentStep}/{totalSteps}</span>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">{Math.round(progress)}%</span>
            </div>
            
            <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    className="absolute inset-y-0 left-0 bg-taxi-primary rounded-full shadow-[0_0_10px_rgba(240,196,25,0.3)]"
                />
            </div>

            <div className="flex justify-between px-0.5">
                {steps.map((step, idx) => {
                    const isCompleted = idx + 1 < currentStep;
                    const isActive = idx + 1 === currentStep;
                    return (
                        <div key={idx} className="flex flex-col items-center gap-1">
                            <div className={`h-1 rounded-full transition-all duration-500 ${
                                isActive ? 'w-4 bg-taxi-primary' : 
                                isCompleted ? 'w-2 bg-emerald-500' : 
                                'w-1 bg-slate-200'
                            }`} />
                            <span className={`text-[7px] font-black uppercase tracking-tighter transition-colors duration-300 ${
                                isActive ? 'text-taxi-text' : 
                                isCompleted ? 'text-emerald-500/70' : 
                                'text-slate-300'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RegistrationProgress;
