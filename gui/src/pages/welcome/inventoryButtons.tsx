// This is the inventory buttons that are shown on the splash screen
// These are dummy buttons
import { vscSidebarBorder } from "@/components";
import { getLogoPath } from "./setup/ImportExtensions";
import { useState } from "react";

const menuItems = [
    {
        id: "agent",
        name: "Agent",
        icon: "creator-no-bg.svg",
        tooltip: "Agent",
        backgroundColor: "bg-[#1e1e1e]",
        textColor: "#4da6ff",
        glow: "shadow-[0px_0px_57.60000228881836px_9.600000381469727px_rgba(77,166,255,0.8)]",
        expandedWidth: "w-[75px]",
        boxShadow: "shadow-[inset_0px_0px_0px_1.2px_#4da6ff80]",
        textMargin: "mb-[2.7px]"
    },
    {
        id: "chat",
        name: "Chat",
        icon: "chat-no-bg.svg",
        tooltip: "Chat",
        backgroundColor: "bg-[#1e1e1e]",
        textColor: "#4da6ff",
        glow: "shadow-[0px_0px_57.60000228881836px_9.600000381469727px_rgba(77,166,255,0.8)]",
        expandedWidth: "w-[65px]",
        boxShadow: "shadow-[inset_0px_0px_0px_1.2px_#4da6ff80]",
        textMargin: "mb-[2.5px]"
    },
    {
        id: "search",
        name: "Search",
        icon: "search-no-bg.svg",
        tooltip: "Search",
        backgroundColor: "bg-[#1e1e1e]",
        textColor: "#4da6ff",
        glow: "shadow-[0px_0px_57.60000228881836px_9.600000381469727px_rgba(77,166,255,0.8)]",
        expandedWidth: "w-[78px]",
        boxShadow: "shadow-[inset_0px_0px_0px_1.2px_#4da6ff80]",
        textMargin: "mb-[2.5px]"
    },
    {
        id: "memory",
        name: "Memory",
        icon: "mem0-no-bg.svg",
        tooltip: "Memory",
        backgroundColor: "bg-[#1e1e1e]",
        textColor: "#4da6ff",
        glow: "shadow-[0px_0px_57.60000228881836px_9.600000381469727px_rgba(77,166,255,0.8)]",
        expandedWidth: "w-[88px]",
        boxShadow: "shadow-[inset_0px_0px_0px_1.2px_#4da6ff80]",
        textMargin: "mb-[2.6px]"
    }
];

const InventoryButtons = ({ activeItemID = "agent" }: { activeItemID?: string }) => {

    // // this is for devving.
    // const [activeItem, setActiveItem] = useState(activeItemID);

    // const handleItemClick = (itemId: string) => {
    //     if (process.env.NODE_ENV !== "development") {
    //         return;
    //     }
    //     setActiveItem(itemId);
    // };

    return (
        <div className={`z-10 select-none`}>
            <div className="flex cursor-pointer">
                <div
                    className="overflow-hidden rounded-xl relative shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.25)]"
                    style={{ background: vscSidebarBorder }}
                >
                    <div className={`flex gap-1 p-1 ${process.env.NODE_ENV === "development" ? "cursor-pointer" : ""}`}>
                        {menuItems.map((item, index) => (
                            <div
                                key={`${item.tooltip}-${index}`}
                                className={` h-7
                                    ${item.backgroundColor}
                                    ${activeItemID === item.id ? item.glow : ""}
                                    ${activeItemID !== item.id ? "z-10" : "z-5"}
                                    rounded-[10px] flex items-center
                                    transition-all duration-500 ease-in-out
                                    ${activeItemID === item.id ? item.expandedWidth : "w-7"}
                                    ${activeItemID === item.id ? item.boxShadow : ""}`}
                                // onClick={() => handleItemClick(item.id)} // this is for devving.
                            >
                                <div
                                    className={`flex-shrink-0 w-7 flex items-center justify-center
                                        ${activeItemID === item.id ? "ml-[1px]" : ""}
                                        `}
                                >
                                    <img
                                        src={getLogoPath(item.icon)}
                                        className="size-5 p-[3px]"
                                        alt={item.tooltip}
                                    />
                                </div>
                                <span
                                    className={`${item.textMargin} flex items-center text-center justify-center text-sm whitespace-nowrap overflow-hidden transition-all duration-200
                                        ${activeItemID === item.id ? "opacity-100" : "opacity-0"}`}
                                    style={{ color: item.textColor }}
                                >
                                    {item.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryButtons;

