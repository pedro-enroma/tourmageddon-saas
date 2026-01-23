'use client'

import React, { useCallback, useMemo } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ConditionNode,
  ConditionGroup,
  Condition,
  TRIGGER_FIELDS,
  getOperatorsForType,
} from '@/lib/notification-rules-types'

interface ConditionTreeBuilderProps {
  trigger: string
  conditions: ConditionNode
  onChange: (conditions: ConditionNode) => void
}

export function ConditionTreeBuilder({ trigger, conditions, onChange }: ConditionTreeBuilderProps) {
  const fields = useMemo(() => TRIGGER_FIELDS[trigger] || [], [trigger])

  const updateNode = useCallback((path: number[], updater: (node: ConditionNode) => ConditionNode) => {
    const updateAtPath = (node: ConditionNode, pathIndex: number): ConditionNode => {
      if (pathIndex >= path.length) {
        return updater(node)
      }

      if (node.type !== 'group') return node

      const newChildren = [...node.children]
      newChildren[path[pathIndex]] = updateAtPath(newChildren[path[pathIndex]], pathIndex + 1)

      return { ...node, children: newChildren }
    }

    onChange(updateAtPath(conditions, 0))
  }, [conditions, onChange])

  const addCondition = useCallback((path: number[]) => {
    const defaultField = fields[0]?.field || 'field'
    const defaultType = fields[0]?.type || 'string'
    const operators = getOperatorsForType(defaultType)

    const newCondition: Condition = {
      type: 'condition',
      field: defaultField,
      operator: operators[0]?.value || 'equals',
      value: '',
    }

    updateNode(path, (node) => {
      if (node.type !== 'group') return node
      return { ...node, children: [...node.children, newCondition] }
    })
  }, [fields, updateNode])

  const addGroup = useCallback((path: number[]) => {
    const newGroup: ConditionGroup = {
      type: 'group',
      operator: 'AND',
      children: [],
    }

    updateNode(path, (node) => {
      if (node.type !== 'group') return node
      return { ...node, children: [...node.children, newGroup] }
    })
  }, [updateNode])

  const removeNode = useCallback((path: number[]) => {
    if (path.length === 0) {
      // Can't remove root
      onChange({ type: 'group', operator: 'AND', children: [] })
      return
    }

    const parentPath = path.slice(0, -1)
    const childIndex = path[path.length - 1]

    updateNode(parentPath, (node) => {
      if (node.type !== 'group') return node
      const newChildren = node.children.filter((_, i) => i !== childIndex)
      return { ...node, children: newChildren }
    })
  }, [onChange, updateNode])

  const toggleOperator = useCallback((path: number[]) => {
    updateNode(path, (node) => {
      if (node.type !== 'group') return node
      return { ...node, operator: node.operator === 'AND' ? 'OR' : 'AND' }
    })
  }, [updateNode])

  const updateConditionField = useCallback((path: number[], field: string) => {
    const fieldConfig = fields.find(f => f.field === field)
    const fieldType = fieldConfig?.type || 'string'
    const operators = getOperatorsForType(fieldType)

    updateNode(path, (node) => {
      if (node.type !== 'condition') return node
      return {
        ...node,
        field,
        operator: operators[0]?.value || 'equals',
        value: '',
      }
    })
  }, [fields, updateNode])

  const updateConditionOperator = useCallback((path: number[], operator: string) => {
    updateNode(path, (node) => {
      if (node.type !== 'condition') return node
      return { ...node, operator }
    })
  }, [updateNode])

  const updateConditionValue = useCallback((path: number[], value: string | number | boolean) => {
    updateNode(path, (node) => {
      if (node.type !== 'condition') return node
      return { ...node, value }
    })
  }, [updateNode])

  const renderCondition = (node: Condition, path: number[]) => {
    const fieldConfig = fields.find(f => f.field === node.field)
    const fieldType = fieldConfig?.type || 'string'
    const operators = getOperatorsForType(fieldType)
    const selectedOperator = operators.find(op => op.value === node.operator)
    const hideValue = selectedOperator?.noValue

    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        {/* Field selector */}
        <div className="relative">
          <select
            value={node.field}
            onChange={(e) => updateConditionField(path, e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
          >
            {fields.map((f) => (
              <option key={f.field} value={f.field}>{f.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Operator selector */}
        <div className="relative">
          <select
            value={node.operator}
            onChange={(e) => updateConditionOperator(path, e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
          >
            {operators.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Value input */}
        {!hideValue && (
          fieldType === 'boolean' ? (
            <div className="relative">
              <select
                value={String(node.value)}
                onChange={(e) => updateConditionValue(path, e.target.value === 'true')}
                className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          ) : fieldType === 'number' ? (
            <Input
              type="number"
              value={node.value as number}
              onChange={(e) => updateConditionValue(path, Number(e.target.value))}
              className="w-24 h-8"
              placeholder="0"
            />
          ) : (
            <Input
              type="text"
              value={node.value as string}
              onChange={(e) => updateConditionValue(path, e.target.value)}
              className="w-40 h-8"
              placeholder="Value..."
            />
          )
        )}

        {/* Remove button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeNode(path)}
          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const renderGroup = (node: ConditionGroup, path: number[], isRoot: boolean = false) => {
    return (
      <div className={`relative ${isRoot ? '' : 'ml-6 mt-2'}`}>
        {/* Group header */}
        <div className={`border-2 rounded-lg p-3 ${node.operator === 'AND' ? 'border-blue-300 bg-blue-50/50' : 'border-orange-300 bg-orange-50/50'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleOperator(path)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  node.operator === 'AND'
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {node.operator}
              </button>
              <span className="text-xs text-gray-500">
                {node.operator === 'AND' ? 'All conditions must match' : 'Any condition can match'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addCondition(path)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Condition
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addGroup(path)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Group
              </Button>
              {!isRoot && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNode(path)}
                  className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Children */}
          <div className="space-y-2">
            {node.children.length === 0 ? (
              <div className="text-center py-4 text-gray-400 text-sm">
                No conditions. Click &quot;+ Condition&quot; to add one.
              </div>
            ) : (
              node.children.map((child, index) => (
                <div key={index}>
                  {child.type === 'group'
                    ? renderGroup(child as ConditionGroup, [...path, index])
                    : renderCondition(child as Condition, [...path, index])
                  }
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!trigger) {
    return (
      <div className="p-4 text-center text-gray-400 border-2 border-dashed rounded-lg">
        Select a trigger event first to configure conditions
      </div>
    )
  }

  if (fields.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 border-2 border-dashed rounded-lg">
        No fields available for this trigger event
      </div>
    )
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">Conditions</Label>
      <p className="text-xs text-gray-500 mb-3">
        Build conditions using AND/OR groups. Click the operator badge to toggle between AND/OR.
      </p>
      {renderGroup(conditions as ConditionGroup, [], true)}
    </div>
  )
}
