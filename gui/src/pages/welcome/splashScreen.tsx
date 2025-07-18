import React from 'react';
import { Button } from "@/components/ui/button";
import { getLogoPath } from './setup/ImportExtensions';
import InventoryButtons from './inventoryButtons';

const SplashScreen = ({ onNext }: { onNext: () => void }) => {
    return (
        <div className="h-full flex-col justify-center items-center gap-10 inline-flex overflow-hidden select-none">
            <div className="max-w-2xl mx-auto text-center flex flex-col gap-7 justify-center">
                {/* <InventoryButtons /> */}
                <div className="flex-col justify-center items-center gap-7 flex w-32 mx-auto">
                    <img src={getLogoPath("pearai-color.png")} alt="..." />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="text-2xl font-['Inter']">Welcome to Dropstone</div>
                    <div className="text-base font-normal text-muted-foreground font-['Inter']">The AI Code Editor For Your Next Project</div>
                </div>
                <Button className="mx-auto w-[300px] rounded-lg justify-center items-center gap-1 inline-flex overflow-hidden" onClick={onNext}>
                    <div className="text-xs font-['Inter']">Next</div>
                </Button>
            </div>
        </div>
    );
};

export default SplashScreen;
